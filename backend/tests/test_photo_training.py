"""Holdout splitting must precede augmentation and keep image hashes disjoint."""
import importlib.util
from pathlib import Path


def test_training_split_keeps_rare_classes_out_of_accuracy_claims():
    path = Path(__file__).resolve().parents[1] / "scripts" / "train_medicine_classifier.py"
    spec = importlib.util.spec_from_file_location("photo_training", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    rows = [{"hash": f"photo-{i}", "label": "well-sampled"} for i in range(6)]
    rows.append({"hash": "only-photo", "label": "rare"})
    train, validation, test = module.split_samples(rows)
    train_hashes = {row["hash"] for row in train}
    validation_hashes = {row["hash"] for row in validation}
    test_hashes = {row["hash"] for row in test}
    assert not train_hashes & validation_hashes
    assert not train_hashes & test_hashes
    assert not validation_hashes & test_hashes
    assert "only-photo" in train_hashes
    assert {row["label"] for row in validation + test} == {"well-sampled"}
    assert len(train) + len(validation) + len(test) == len(rows)
    assert module.split_samples(rows) == module.split_samples(rows)
