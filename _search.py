import sys
import io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

import importlib.util
spec = importlib.util.spec_from_file_location("search", r"C:\Users\Jixiong.Lu\AppData\Roaming\GeelyClaw\SKILLs\web-search\scripts\search.py")
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
