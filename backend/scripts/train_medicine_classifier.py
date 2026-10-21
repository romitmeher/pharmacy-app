"""Train an experimental GPU photo classifier; never auto-deploy to billing.

Photographs are split by content hash before augmentation. Classes without
enough independent photos are training-only and excluded from accuracy claims.
"""
import argparse
from collections import defaultdict
from datetime import datetime, timezone
import json
from pathlib import Path
import random
import sqlite3

import torch
from PIL import Image
from torch import nn
from torch.utils.data import DataLoader, Dataset
from torchvision import transforms
from torchvision.models import mobilenet_v3_small, MobileNet_V3_Small_Weights


def read_samples(root):
    with sqlite3.connect((root / "library.sqlite3").as_uri() + "?mode=ro", uri=True) as connection:
        rows = connection.execute("""
            SELECT p.sha256,p.path,l.normalized,min(l.name) FROM photos p
            JOIN labels l ON l.photo_id=p.id WHERE p.state='indexed'
            AND NOT EXISTS (SELECT 1 FROM photos other JOIN labels x ON x.photo_id=other.id
                            WHERE other.sha256=p.sha256 AND x.normalized<>l.normalized)
            GROUP BY p.sha256,l.normalized ORDER BY l.normalized,p.sha256
        """).fetchall()
    samples = []
    for digest, relative, normalized, name in rows:
        path = (root / relative).resolve()
        if path.is_relative_to(root) and path.is_file():
            samples.append({"hash": digest, "path": str(path), "label": normalized, "name": name})
    return samples


def split_samples(samples, seed=42):
    grouped = defaultdict(list)
    for sample in samples:
        grouped[sample["label"]].append(sample)
    generator = random.Random(seed)
    train, validation, test = [], [], []
    for label in sorted(grouped):
        rows = grouped[label].copy()
        generator.shuffle(rows)
        if len(rows) >= 5:
            test.append(rows.pop())
            validation.append(rows.pop())
        train.extend(rows)
    return train, validation, test


class MedicinePhotos(Dataset):
    def __init__(self, rows, labels, training=False):
        self.rows, self.labels = rows, labels
        operations = [transforms.Resize((192, 192))]
        if training:
            operations.extend([transforms.RandomRotation(20), transforms.ColorJitter(0.15, 0.15, 0.1)])
        operations.extend([transforms.ToTensor(), transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225])])
        self.transform = transforms.Compose(operations)

    def __len__(self):
        return len(self.rows)

    def __getitem__(self, index):
        row = self.rows[index]
        with Image.open(row["path"]) as image:
            tensor = self.transform(image.convert("RGB"))
        return tensor, self.labels[row["label"]]


def evaluate(model, loader, device):
    if loader is None:
        return None
    model.eval()
    correct, total = 0, 0
    with torch.inference_mode():
        for images, labels in loader:
            predicted = model(images.to(device)).argmax(1).cpu()
            correct += int((predicted == labels).sum())
            total += len(labels)
    return correct / total if total else None


def train(args):
    torch.manual_seed(args.seed)
    random.seed(args.seed)
    torch.set_num_threads(4)
    if not torch.cuda.is_available():
        raise RuntimeError("CUDA-enabled PyTorch and an available NVIDIA GPU are required for this training command.")
    device = torch.device("cuda")
    torch.backends.cudnn.benchmark = True
    root = args.root.resolve()
    output = (args.output or root / "training" / "mobilenet-v3-small").resolve()
    output.mkdir(parents=True, exist_ok=True)
    samples = read_samples(root)
    train_rows, validation_rows, test_rows = split_samples(samples, args.seed)
    names = {row["label"]: row["name"] for row in samples}
    labels = {label: index for index, label in enumerate(sorted(names))}
    if len(labels) < 2:
        raise RuntimeError("At least two unambiguous medicine classes are required.")
    if (output / "classifier.pt").exists():
        raise RuntimeError("This output already contains a model. Choose a new --output directory to preserve it.")
    report = {
        "started_at": datetime.now(timezone.utc).isoformat(),
        "status": "training", "gpu": torch.cuda.get_device_name(0),
        "torch": torch.__version__, "cuda": torch.version.cuda,
        "classes": len(labels), "independent_photos": len(samples),
        "training_photos": len(train_rows), "validation_photos": len(validation_rows),
        "test_photos": len(test_rows), "evaluated_classes": len({row['label'] for row in test_rows}),
        "deployment_enabled": False,
        "limitation": "Weak dataset labels; most classes may have only one independent photo. Training accuracy is not recognition accuracy.",
        "epochs": [],
    }
    def record():
        temporary = output / "report.json.tmp"
        temporary.write_text(json.dumps(report, indent=2), encoding="utf-8")
        temporary.replace(output / "report.json")
    record()
    (output / "split.json").write_text(json.dumps({
        name: [{"hash": row["hash"], "label": row["label"]} for row in rows]
        for name, rows in [("train", train_rows), ("validation", validation_rows), ("test", test_rows)]
    }), encoding="utf-8")
    (output / "labels.json").write_text(json.dumps({str(index): {"key": label, "name": names[label]}
                                                   for label, index in labels.items()}, indent=2), encoding="utf-8")
    model = mobilenet_v3_small(weights=MobileNet_V3_Small_Weights.DEFAULT)
    model.classifier[-1] = nn.Linear(model.classifier[-1].in_features, len(labels))
    for parameter in model.features.parameters():
        parameter.requires_grad = False
    for parameter in model.features[-1].parameters():
        parameter.requires_grad = True
    model.to(device)
    optimizer = torch.optim.AdamW((p for p in model.parameters() if p.requires_grad), lr=args.learning_rate)
    scaler = torch.amp.GradScaler("cuda")
    criterion = nn.CrossEntropyLoss(label_smoothing=0.05)
    train_loader = DataLoader(MedicinePhotos(train_rows, labels, True), batch_size=args.batch_size,
                              shuffle=True, num_workers=args.workers, pin_memory=True,
                              persistent_workers=args.workers > 0)
    def eval_loader(rows):
        return DataLoader(MedicinePhotos(rows, labels), batch_size=args.batch_size, num_workers=0) if rows else None
    validation_loader, test_loader = eval_loader(validation_rows), eval_loader(test_rows)
    best_validation = -1
    best_state = None
    try:
        for epoch in range(args.epochs):
            model.train()
            model.features.eval()
            model.features[-1].train()
            total_loss, total, correct = 0.0, 0, 0
            for batch_index, (images, target) in enumerate(train_loader, 1):
                images, target = images.to(device, non_blocking=True), target.to(device, non_blocking=True)
                optimizer.zero_grad(set_to_none=True)
                with torch.autocast("cuda", dtype=torch.float16):
                    logits = model(images)
                    loss = criterion(logits, target)
                scaler.scale(loss).backward()
                scaler.step(optimizer)
                scaler.update()
                total_loss += float(loss.detach()) * len(target)
                correct += int((logits.detach().argmax(1) == target).sum())
                total += len(target)
                if batch_index % 100 == 0:
                    print(json.dumps({"epoch": epoch + 1, "batch": batch_index,
                                      "total_batches": len(train_loader), "photos_processed": total}), flush=True)
            validation_accuracy = evaluate(model, validation_loader, device)
            report["epochs"].append({"epoch": epoch + 1, "loss": total_loss / total,
                                     "training_accuracy": correct / total,
                                     "validation_accuracy": validation_accuracy})
            if validation_accuracy is not None and validation_accuracy > best_validation:
                best_validation = validation_accuracy
                best_state = {name: value.detach().cpu().clone() for name, value in model.state_dict().items()}
            record()
            print(json.dumps(report["epochs"][-1]), flush=True)
        if best_state is not None:
            model.load_state_dict(best_state)
        report["test_accuracy"] = evaluate(model, test_loader, device)
        report["status"] = "trained_experimental"
        report["finished_at"] = datetime.now(timezone.utc).isoformat()
        torch.save({"architecture": "mobilenet_v3_small", "state_dict": model.cpu().state_dict(),
                    "classes": labels, "deployment_enabled": False}, output / "classifier.pt")
        record()
        print(json.dumps({"output": str(output), "status": report["status"],
                          "test_accuracy": report["test_accuracy"], "deployment_enabled": False}), flush=True)
    except BaseException as error:
        report["status"] = "failed"
        report["error"] = str(error)
        record()
        raise


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[2] / "data" / "medicine_photos")
    parser.add_argument("--output", type=Path)
    parser.add_argument("--epochs", type=int, default=12)
    parser.add_argument("--batch-size", type=int, default=24)
    parser.add_argument("--workers", type=int, default=4)
    parser.add_argument("--learning-rate", type=float, default=0.001)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()
    if args.epochs < 1 or args.batch_size < 1 or not 0 <= args.workers <= 8:
        parser.error("Epochs and batch size must be positive; workers must be between 0 and 8.")
    try:
        train(args)
    except Exception as error:
        output = (args.output or args.root / "training" / "mobilenet-v3-small").resolve()
        report_path = output / "report.json"
        if report_path.exists():
            report = json.loads(report_path.read_text(encoding="utf-8"))
            if report.get("status") == "training":
                report.update(status="failed", error=str(error))
                report_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
        raise


if __name__ == "__main__":
    main()
