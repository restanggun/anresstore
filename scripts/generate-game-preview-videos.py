from pathlib import Path
import cv2
import numpy as np
from PIL import Image, ImageEnhance

root = Path(__file__).resolve().parents[1]
cover_dir = root / "apps" / "web" / "public" / "brand" / "games" / "covers"
output_dir = root / "apps" / "web" / "public" / "brand" / "games" / "previews"
output_dir.mkdir(parents=True, exist_ok=True)

for cover_path in sorted(cover_dir.glob("*")):
    if cover_path.suffix.lower() not in {".jpg", ".jpeg", ".png", ".webp"}:
        continue

    output_path = output_dir / f"{cover_path.stem}.mp4"
    if output_path.exists():
        continue

    img = Image.open(cover_path).convert("RGB")
    width, height = img.size
    target_w = 960
    target_h = 1280
    if width > height:
        target_h = max(720, int(target_w * height / width))
    else:
        target_w = max(720, int(target_h * width / height))

    frames = 42
    fps = 18
    writer = cv2.VideoWriter(
        str(output_path),
        cv2.VideoWriter_fourcc(*"mp4v"),
        fps,
        (target_w, target_h),
    )

    if writer.isOpened() is False:
        raise RuntimeError(f"Unable to create video writer for {output_path}")

    for frame_index in range(frames):
        ratio = 1.0 + (frame_index / max(1, frames - 1)) * 0.16
        resized = img.resize((int(width * ratio), int(height * ratio)), Image.Resampling.LANCZOS)
        canvas = Image.new("RGB", (target_w, target_h), (14, 16, 20))
        x = (resized.size[0] - target_w) // 2
        y = (resized.size[1] - target_h) // 2
        if x < 0:
            resized = resized.crop((-x, 0, resized.size[0] - x, resized.size[1]))
            x = 0
        if y < 0:
            resized = resized.crop((0, -y, resized.size[0], resized.size[1] - y))
            y = 0
        if x > 0 or y > 0:
            crop = resized.crop((max(0, x), max(0, y), min(resized.size[0], target_w + x), min(resized.size[1], target_h + y)))
            canvas.paste(crop, ((target_w - crop.size[0]) // 2, (target_h - crop.size[1]) // 2))
        else:
            canvas.paste(resized, ((target_w - resized.size[0]) // 2, (target_h - resized.size[1]) // 2))

        enhancer = ImageEnhance.Brightness(canvas)
        canvas = enhancer.enhance(1.02)

        frame = np.array(canvas)
        frame = cv2.cvtColor(frame, cv2.COLOR_RGB2BGR)
        writer.write(frame)

    writer.release()
    print(f"generated {output_path.name}")
