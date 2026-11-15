from pathlib import Path
import shutil

root = Path(__file__).resolve().parents[1]
dist = root / "dist"
dist.mkdir(exist_ok=True)
for name in ("index.html", "styles.css", "core.js", "app.js"):
    shutil.copy2(root / name, dist / name)
shutil.copytree(root / "图片", dist / "图片", dirs_exist_ok=True)
print("Static site prepared in dist/")
