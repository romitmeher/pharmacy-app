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


def _load():
    global _loaded, _unavailable
    if _unavailable:
        return None
    if _loaded is not None:
        return _loaded
    root = Path(os.environ.get("SMARTPHARM_PHOTO_MODEL", str(
        DATA_ROOT / "medicine_photos/training/full-20261021")))
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
                indices = model(tensor).topk(5, dim=1).indices[0].tolist()
            keys = {normalize_label(candidate.name),
                    normalize_label(f"{candidate.name} {candidate.strength or ''}")}
            agreement = any(labels[str(index)]["key"] in keys for index in indices)
            return {"status": "supporting_evidence", "agrees_with_ocr": agreement,
                    "device": str(device), "experimental": True}
    except Exception:
        _unavailable = True
        logger.warning("Photo classifier unavailable; continuing OCR matching", exc_info=True)
        return None
