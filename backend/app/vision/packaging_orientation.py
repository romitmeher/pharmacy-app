"""Retry unreadable packaging at right angles without relaxing identity checks."""
import cv2
from app.vision.ocr_engine import OCRResult, OCRWordBox


def restore_orientation(result, angle, shape):
    """Return OCR boxes in the uploaded image coordinates, not rotated coordinates."""
    height, width = shape[:2]
    def point(x, y):
        if angle == 90:
            return [y, height - 1 - x]
        if angle == 270:
            return [width - 1 - y, x]
        if angle == 180:
            return [width - 1 - x, height - 1 - y]
        return [x, y]
    return OCRResult(result.full_text, list(result.lines), [
        OCRWordBox(word.text, word.confidence, [point(x, y) for x, y in word.box])
        for word in result.word_boxes
    ], result.avg_confidence)


def read_packaging_orientations(image, read, extract, match):
    """Keep a grounded match; retry only when the existing matcher rejects a read."""
    best = None
    best_rank = None
    for angle, code in [(0, None), (270, cv2.ROTATE_90_COUNTERCLOCKWISE),
                        (90, cv2.ROTATE_90_CLOCKWISE), (180, cv2.ROTATE_180)]:
        frame = image if code is None else cv2.rotate(image, code)
        result = restore_orientation(read(frame), angle, image.shape)
        entities = extract(result)
        candidate = match(entities)
        top = candidate.top_candidate
        rank = (bool(top and not candidate.low_confidence),
                top.score_breakdown.get("brand_score", 0) if top else 0,
                top.confidence_score if top else 0, result.avg_confidence)
        if best_rank is None or rank > best_rank:
            best, best_rank = (result, entities, candidate, angle), rank
        if top and not candidate.low_confidence:
            break
    return best
