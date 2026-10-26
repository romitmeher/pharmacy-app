"""Optional local classifier evidence, never a substitute for OCR identity."""
import json
import logging
import os
from pathlib import Path
from threading import Lock

from app.vision.data_paths import DATA_ROOT
from app.vision.photo_library import normalize_label

logger = logging.getLogger(__name__)
_lock = Lock()
_loaded = None
_unavailable = False
_loaded_root = None
_references = {}


def demo_review_suggestion(image, store_id):
    """Demo-only learned label plus geometric reference agreement, never a bill match."""
    from flask import current_app, has_app_context
    if not has_app_context() or not current_app.config.get("DEMO_PHOTO_REVIEW") or not store_id:
        return None
    try:
        import cv2
        import numpy as np
        import torch
        from PIL import Image
        from app.models.medicine import Medicine
        with _lock:
            loaded = _load()
            if loaded is None:
                return None
            model, transform, labels, device = loaded
            tensor = transform(Image.fromarray(image[:, :, ::-1].copy())).unsqueeze(0).to(device)
            with torch.inference_mode():
                probabilities = model(tensor).softmax(1)[0]
                values, indices = probabilities.topk(min(2, len(labels)))
            if len(values) < 2 or float(values[0]) < 0.80 or float(values[0]-values[1]) < 0.50:
                return None
            label = labels[str(int(indices[0]))]
            root = _loaded_root.parent
            annotation_path = root / "annotations.json"
            cache_key = (str(root), annotation_path.stat().st_mtime_ns)
            orb = cv2.ORB_create(nfeatures=1600)
            query_points, query_descriptors = orb.detectAndCompute(cv2.cvtColor(image, cv2.COLOR_BGR2GRAY), None)
            if query_descriptors is None:
                return None
            if cache_key not in _references:
                records = []
                for row in json.loads(annotation_path.read_text(encoding="utf-8"))["images"]:
                    path = (root / row["file"]).resolve()
                    if not path.is_relative_to(root.resolve()):
                        continue
                    reference = cv2.imread(str(path))
                    if reference is not None:
                        points, descriptors = orb.detectAndCompute(cv2.cvtColor(reference, cv2.COLOR_BGR2GRAY), None)
                        records.append((row["key"], points, descriptors))
                _references.clear()
                _references[cache_key] = records
            verified = False
            matcher = cv2.BFMatcher(cv2.NORM_HAMMING)
            for key, points, descriptors in _references[cache_key]:
                if key != label["key"] or descriptors is None:
                    continue
                matches = matcher.knnMatch(query_descriptors, descriptors, k=2)
                good = [pair[0] for pair in matches if len(pair) == 2 and pair[0].distance < .70*pair[1].distance]
                if len(good) < 30:
                    continue
                src = np.float32([query_points[m.queryIdx].pt for m in good]).reshape(-1, 1, 2)
                dst = np.float32([points[m.trainIdx].pt for m in good]).reshape(-1, 1, 2)
                _, mask = cv2.findHomography(src, dst, cv2.RANSAC, 4.0)
                if mask is not None and int(mask.sum()) >= 25 and float(mask.mean()) >= .65:
                    verified = True
                    break
            if not verified:
                return None
            meds = Medicine.query.filter_by(store_id=store_id, is_active=True, brand_name=label["name"]).all()
            if len(meds) != 1:
                return None
            med = meds[0]
            return {"medicine_id": med.id, "name": med.brand_name, "strength": med.strength,
                    "generic_name": med.generic_name, "experimental": True,
                    "message": "Demo model and a labelled reference agree. Review the printed name, strength and pack in the catalog. This is not a verified billing match."}
    except Exception:
        logger.warning("Demo review model unavailable; using normal recognition", exc_info=True)
        return None


def _load():
    global _loaded, _unavailable, _loaded_root
    from flask import current_app, has_app_context
    configured = current_app.config.get("SMARTPHARM_PHOTO_MODEL") if has_app_context() else None
    root = Path(configured or os.environ.get("SMARTPHARM_PHOTO_MODEL", str(
        DATA_ROOT / "medicine_photos/training/full-20261021")))
    if _loaded_root != root:
        _loaded, _unavailable, _loaded_root = None, False, root
    if _unavailable:
        return None
    if _loaded is not None:
        return _loaded
    if not (root / "classifier.pt").is_file():
        _unavailable = True
        return None
    import torch
    torch.set_num_threads(4)
    from torchvision import transforms
    from torchvision.models import mobilenet_v3_small
    checkpoint = torch.load(root / "classifier.pt", map_location="cpu", weights_only=True)
    labels = json.loads((root / "labels.json").read_text(encoding="utf-8"))
    classes = checkpoint["classes"]
    model = mobilenet_v3_small(num_classes=len(classes))
    model.load_state_dict(checkpoint["state_dict"])
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model.to(device).eval()
    transform = transforms.Compose([transforms.Resize((192, 192)), transforms.ToTensor(),
        transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225])])
    _loaded = (model, transform, labels, device)
    return _loaded


def photo_model_evidence(image, candidate):
    """Report agreement with an already grounded DB candidate; never change its score."""
    global _unavailable
    try:
        with _lock:
            loaded = _load()
            if loaded is None:
                return None
            import torch
            from PIL import Image
            model, transform, labels, device = loaded
            tensor = transform(Image.fromarray(image[:, :, ::-1].copy())).unsqueeze(0).to(device)
            with torch.inference_mode():
                indices = model(tensor).topk(min(5, len(labels)), dim=1).indices[0].tolist()
            keys = {normalize_label(candidate.name),
                    normalize_label(f"{candidate.name} {candidate.strength or ''}")}
            agreement = any(labels[str(index)]["key"] in keys for index in indices)
            return {"status": "supporting_evidence", "agrees_with_ocr": agreement,
                    "device": str(device), "experimental": True}
    except Exception:
        _unavailable = True
        logger.warning("Photo classifier unavailable; continuing OCR matching", exc_info=True)
        return None
