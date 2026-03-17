import base64
import io
import sys

from PIL import Image


def main():
    image_path = sys.argv[1]
    with Image.open(image_path) as img:
        width, height = img.size
        crop_x = round(width * 0.30)
        crop_w = round(width * 0.70)
        crop_h = round(height * 0.18)
        region = img.crop((crop_x, 0, crop_x + crop_w, crop_h)).convert("L")
        region = region.resize((region.width * 3, region.height * 3), Image.Resampling.NEAREST)
        thresholded = region.point(lambda value: 255 if value > 128 else 0)

        buffer = io.BytesIO()
        thresholded.save(buffer, format="PNG")
        sys.stdout.write(base64.b64encode(buffer.getvalue()).decode("utf-8"))


if __name__ == "__main__":
    main()
