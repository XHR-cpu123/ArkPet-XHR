import argparse
import json
import os
import sys
import traceback


def send(payload):
    sys.stdout.write(json.dumps(payload, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def load_llm(source_path, model_id):
    import torch
    from transformers import AutoConfig, AutoModelForCausalLM, AutoTokenizer

    if source_path.lower().endswith(".gguf"):
        try:
            from llama_cpp import Llama
        except Exception as error:
            try:
                from ctransformers import LLM as CTransformersLLM
            except Exception as fallback_error:
                raise RuntimeError(
                    "GGUF 运行组件尚未安装，需要 llama-cpp-python 或 ctransformers。"
                ) from fallback_error
            model = CTransformersLLM(
                model_path=source_path,
                context_length=4096,
                threads=max(2, (os.cpu_count() or 4) - 1),
                gpu_layers=0,
            )
            return {
                "backend": "ctransformers",
                "model": model,
                "tokenizer": None,
            }
        model = Llama(
            model_path=source_path,
            n_ctx=4096,
            n_threads=max(2, (os.cpu_count() or 4) - 1),
            verbose=False,
        )
        return {
            "backend": "llama.cpp",
            "model": model,
            "tokenizer": None,
        }

    if os.path.isdir(source_path):
        tokenizer = AutoTokenizer.from_pretrained(
            source_path,
            trust_remote_code=True,
            local_files_only=True,
        )
        model = AutoModelForCausalLM.from_pretrained(
            source_path,
            trust_remote_code=True,
            torch_dtype=torch.float32,
            low_cpu_mem_usage=hasattr(torch, "float8_e4m3fn"),
            local_files_only=True,
        )
        model.to("cpu")
        model.eval()
        return {
            "backend": "transformers",
            "model": model,
            "tokenizer": tokenizer,
        }

    if source_path.lower().endswith(".safetensors"):
        if not model_id:
            raise RuntimeError(
                "这个 .safetensors 还不能确定模型家族和适配信息。"
            )
        from safetensors.torch import load_file

        config = AutoConfig.from_pretrained(
            model_id,
            trust_remote_code=True,
        )
        tokenizer = AutoTokenizer.from_pretrained(
            model_id,
            trust_remote_code=True,
        )
        model = AutoModelForCausalLM.from_config(
            config,
            trust_remote_code=True,
        )
        state_dict = load_file(source_path)
        missing, unexpected = model.load_state_dict(state_dict, strict=False)
        if len(missing) > len(state_dict) * 0.25:
            raise RuntimeError(
                "单个 .safetensors 与内置适配信息不匹配，请改用完整模型文件夹。"
            )
        model.to("cpu")
        model.eval()
        return {
            "backend": "transformers",
            "model": model,
            "tokenizer": tokenizer,
        }

    raise RuntimeError("不支持的对话模型格式。")


def load_asr(source_path):
    import torch
    from transformers import AutoModelForSpeechSeq2Seq, AutoProcessor

    processor = AutoProcessor.from_pretrained(
        source_path,
        local_files_only=True,
    )
    model = AutoModelForSpeechSeq2Seq.from_pretrained(
        source_path,
        torch_dtype=torch.float32,
        low_cpu_mem_usage=hasattr(torch, "float8_e4m3fn"),
        local_files_only=True,
    )
    model.to("cpu")
    model.eval()
    return {
        "model": model,
        "processor": processor,
    }


def chat_llm(runtime, request):
    messages = request.get("messages") or []
    if runtime["backend"] == "ctransformers":
        prompt = "\n".join(
            f"{message.get('role', 'user')}: {message.get('content', '')}"
            for message in messages
        )
        prompt += "\nassistant:"
        text = runtime["model"](
            prompt,
            max_new_tokens=int(request.get("max_new_tokens", 512)),
            temperature=float(request.get("temperature", 0.8)),
        )
        return {"text": str(text).strip()}
    if runtime["backend"] == "llama.cpp":
        result = runtime["model"].create_chat_completion(
            messages=messages,
            temperature=float(request.get("temperature", 0.8)),
            max_tokens=int(request.get("max_new_tokens", 512)),
        )
        text = result["choices"][0]["message"]["content"]
        return {"text": text}

    import torch

    tokenizer = runtime["tokenizer"]
    model = runtime["model"]
    if getattr(tokenizer, "chat_template", None):
        prompt = tokenizer.apply_chat_template(
            messages,
            tokenize=False,
            add_generation_prompt=True,
        )
    else:
        prompt = "\n".join(
            f"{message.get('role', 'user')}: {message.get('content', '')}"
            for message in messages
        )
        prompt += "\nassistant:"
    inputs = tokenizer(prompt, return_tensors="pt")
    with torch.inference_mode():
        output = model.generate(
            **inputs,
            max_new_tokens=int(request.get("max_new_tokens", 512)),
            do_sample=True,
            temperature=float(request.get("temperature", 0.8)),
            repetition_penalty=1.08,
        )
    generated = output[0][inputs["input_ids"].shape[1] :]
    text = tokenizer.decode(generated, skip_special_tokens=True).strip()
    return {"text": text}


def transcribe_audio(runtime, request):
    import soundfile as sf
    import torch
    import torchaudio

    audio_path = request.get("audio_path")
    if not audio_path:
        raise RuntimeError("没有提供音频文件。")
    samples, sample_rate = sf.read(audio_path, always_2d=False)
    waveform = torch.tensor(samples, dtype=torch.float32)
    if waveform.ndim > 1:
        waveform = waveform.mean(dim=1)
    if sample_rate != 16000:
        waveform = torchaudio.functional.resample(
            waveform,
            sample_rate,
            16000,
        )
    processor = runtime["processor"]
    model = runtime["model"]
    inputs = processor(
        waveform.numpy(),
        sampling_rate=16000,
        return_tensors="pt",
    )
    with torch.inference_mode():
        generated = model.generate(**inputs)
    text = processor.batch_decode(generated, skip_special_tokens=True)[0]
    return {"text": text.strip()}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--kind", choices=["llm", "asr"], required=True)
    parser.add_argument("--source-path", required=True)
    parser.add_argument("--model-id", default="")
    args = parser.parse_args()

    try:
        runtime = (
            load_llm(args.source_path, args.model_id)
            if args.kind == "llm"
            else load_asr(args.source_path)
        )
        send({"type": "ready", "backend": runtime.get("backend", "transformers")})
    except Exception as error:
        print(traceback.format_exc(), file=sys.stderr, flush=True)
        send({"type": "error", "error": str(error)})
        return 1

    for line in sys.stdin:
        if not line.strip():
            continue
        try:
            request = json.loads(line)
            request_id = request.get("id")
            if args.kind == "llm":
                result = chat_llm(runtime, request)
            else:
                result = transcribe_audio(runtime, request)
            send({"id": request_id, **result})
        except Exception as error:
            send(
                {
                    "id": request.get("id") if "request" in locals() else "",
                    "error": str(error),
                    "traceback": traceback.format_exc(),
                }
            )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
