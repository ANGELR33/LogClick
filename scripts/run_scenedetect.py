import argparse
import json

import os
import sys

_script_dir = os.path.dirname(os.path.abspath(__file__))
if _script_dir in sys.path:
    sys.path.remove(_script_dir)

from scenedetect import open_video, SceneManager
from scenedetect.detectors import ContentDetector


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--threshold", type=float, default=27.0)
    args = parser.parse_args()

    video = open_video(args.input)
    scene_manager = SceneManager()
    scene_manager.add_detector(ContentDetector(threshold=args.threshold))
    scene_manager.detect_scenes(video=video)
    scene_list = scene_manager.get_scene_list()

    scenes = []
    for start, end in scene_list:
        scenes.append(
            {
                "start": start.get_seconds(),
                "end": end.get_seconds(),
            }
        )

    with open(args.output, "w", encoding="utf-8") as f:
        json.dump({"scenes": scenes}, f, ensure_ascii=False, indent=2)


if __name__ == "__main__":
    main()
