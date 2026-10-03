import argparse
import json
import os
import sys


def fail(message):
    print(message, flush=True)
    sys.exit(1)


def load_config(path):
    with open(path, "r", encoding="utf-8") as handle:
        return json.load(handle)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", required=True)
    args = parser.parse_args()
    config = load_config(args.config)

    try:
        import torch
        from datasets import load_dataset
        from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training
        from transformers import (
            AutoModelForCausalLM,
            AutoTokenizer,
            BitsAndBytesConfig,
            DataCollatorForLanguageModeling,
            Trainer,
            TrainingArguments,
        )
    except Exception as error:
        fail(
            "Training dependencies are missing. Install torch, transformers, "
            "datasets, peft, accelerate and bitsandbytes in the local Python "
            f"environment first. Details: {error}"
        )

    base_model = config["baseModel"]
    dataset_path = config["datasetPath"]
    output_path = config["outputPath"]
    os.makedirs(output_path, exist_ok=True)

    tokenizer = AutoTokenizer.from_pretrained(base_model, trust_remote_code=True)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    quantization = None
    if torch.cuda.is_available():
        quantization = BitsAndBytesConfig(
            load_in_4bit=True,
            bnb_4bit_compute_dtype=torch.float16,
            bnb_4bit_quant_type="nf4",
            bnb_4bit_use_double_quant=True,
        )

    model = AutoModelForCausalLM.from_pretrained(
        base_model,
        device_map="auto",
        trust_remote_code=True,
        quantization_config=quantization,
    )
    model = prepare_model_for_kbit_training(model)
    model = get_peft_model(
        model,
        LoraConfig(
            r=16,
            lora_alpha=32,
            lora_dropout=0.05,
            bias="none",
            task_type="CAUSAL_LM",
        ),
    )

    dataset = load_dataset("json", data_files=dataset_path, split="train")

    def render(example):
        text = tokenizer.apply_chat_template(
            example["messages"],
            tokenize=False,
            add_generation_prompt=False,
        )
        tokenized = tokenizer(
            text,
            truncation=True,
            max_length=int(config.get("maxLength", 1024)),
        )
        tokenized["labels"] = tokenized["input_ids"].copy()
        return tokenized

    dataset = dataset.map(render, remove_columns=dataset.column_names)
    training_args = TrainingArguments(
        output_dir=output_path,
        num_train_epochs=float(config.get("epochs", 3)),
        learning_rate=float(config.get("learningRate", 0.0002)),
        per_device_train_batch_size=int(config.get("batchSize", 1)),
        gradient_accumulation_steps=8,
        logging_steps=5,
        save_strategy="epoch",
        fp16=torch.cuda.is_available(),
        report_to=[],
    )
    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=dataset,
        data_collator=DataCollatorForLanguageModeling(tokenizer, mlm=False),
    )
    trainer.train()
    model.save_pretrained(output_path)
    tokenizer.save_pretrained(output_path)
    print(f"Training finished. Adapter saved to {output_path}", flush=True)


if __name__ == "__main__":
    main()
