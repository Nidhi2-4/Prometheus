import pandas as pd
d = pd.read_sas("/run/media/pravesh/New Volume/Promethius-26/datasets/nhanes/PAQ_L.xpt")
for c in ["PAD790Q","PAD790U","PAD800","PAD810Q","PAD810U","PAD820"]:
    print(c, d[c].isna().mean().round(3)); print(d[c].value_counts(dropna=False).head(8), "\n")