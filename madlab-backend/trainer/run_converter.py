#!/usr/bin/env python3
"""Wrapper to run convert_hf_to_gguf from installed packages."""
import subprocess
import sys
from pathlib import Path

def find_converter():
    """Find convert_hf_to_gguf.py in site-packages."""
    site_packages = Path(sys.prefix) / 'Lib' / 'site-packages'
    if not site_packages.exists():
        site_packages = Path(sys.prefix) / 'lib' / f'python{sys.version_info.major}.{sys.version_info.minor}' / 'site-packages'

    converter = site_packages / 'bin' / 'convert_hf_to_gguf.py'
    if converter.exists():
        return converter

    # Fallback: search in site-packages root
    for p in site_packages.glob('**/convert_hf_to_gguf.py'):
        return p

    return None

if __name__ == '__main__':
    converter = find_converter()
    if not converter:
        print('Error: convert_hf_to_gguf.py not found in site-packages.', file=sys.stderr)
        print('Make sure llama-cpp-python or gguf package is installed.', file=sys.stderr)
        sys.exit(1)

    result = subprocess.run([sys.executable, str(converter)] + sys.argv[1:])
    sys.exit(result.returncode)
