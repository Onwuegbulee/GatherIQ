import sys, json
try:
    import torch
    print('torch_version', torch.__version__)
    print('cuda_available', torch.cuda.is_available())
    print('cuda_version', getattr(torch.version, 'cuda', None))
except Exception as e:
    print('torch_import_error', str(e))
try:
    import ultralytics
    print('ultralytics_version', ultralytics.__version__)
except Exception as e:
    print('ultralytics_import_error', str(e))
