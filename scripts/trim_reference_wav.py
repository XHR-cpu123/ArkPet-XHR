import argparse
import wave


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("source")
    parser.add_argument("target")
    parser.add_argument("seconds", type=float, default=8)
    args = parser.parse_args()

    with wave.open(args.source, "rb") as source:
        params = source.getparams()
        frames = source.readframes(source.getnframes())

    max_frames = int(params.framerate * args.seconds)
    if params.nframes > max_frames:
        frame_width = params.sampwidth * params.nchannels
        frames = frames[: max_frames * frame_width]

    with wave.open(args.target, "wb") as target:
        target.setparams(params)
        target.writeframes(frames)


if __name__ == "__main__":
    main()
