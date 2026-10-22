#!/usr/bin/env python3
"""
HA-01 · Model 2 (Diabetes risk) — dataset builder

Same NHANES cycles as Model 1, plus HbA1c (GHB) and family history (MCQ, 2017–20 only).
Writes:
    <OUT_DIR>/diabetes_nhanes.csv     (both cycles, column `cycle` = P or L)
    <OUT_DIR>/diabetes_train.csv      (P cycle  -> train / validate)
    <OUT_DIR>/diabetes_external.csv   (L cycle  -> external test; NO family history)

Target `dm` = 1 if HbA1c >= 6.5 OR doctor-diagnosed diabetes OR on insulin / diabetes pills.
Columns starting with `ref_` define/describe the label -> NEVER use as features.

Usage:
    python build_diabetes_dataset.py               # downloads only missing files
    python build_diabetes_dataset.py --no-download
"""
import argparse
import os
import sys
import urllib.request

import numpy as np
import pandas as pd

BASE = "/run/media/pravesh/New Volume/Promethius-26/datasets"   # <- change if needed
RAW_DIR = os.path.join(BASE, "nhanes")
OUT_DIR = BASE

CYCLES = {
    "P": {"year": "2017", "weight": "WTMECPRP",
          "files": {"demo": "P_DEMO", "bpq": "P_BPQ", "bmx": "P_BMX", "smq": "P_SMQ",
                    "alq": "P_ALQ", "paq": "P_PAQ", "diq": "P_DIQ", "slq": "P_SLQ",
                    "ghb": "P_GHB", "mcq": "P_MCQ"}},
    "L": {"year": "2021", "weight": "WTMEC2YR",
          "files": {"demo": "DEMO_L", "bpq": "BPQ_L", "bmx": "BMX_L", "smq": "SMQ_L",
                    "alq": "ALQ_L", "paq": "PAQ_L", "diq": "DIQ_L", "slq": "SLQ_L",
                    "ghb": "GHB_L"}},          # MCQ_L has no family-history questions
}
BASE_URL = "https://wwwn.cdc.gov/Nchs/Data/Nhanes/Public/{year}/DataFiles/{name}.xpt"
ALQ121_DAYS = {0: 0, 1: 365, 2: 286, 3: 182, 4: 104, 5: 52, 6: 30, 7: 12, 8: 9, 9: 4.5, 10: 1.5}
UNIT_PER_WEEK = {"D": 7.0, "W": 1.0, "M": 12 / 52, "Y": 1 / 52}


def download():
    os.makedirs(RAW_DIR, exist_ok=True)
    for cyc in CYCLES.values():
        for name in cyc["files"].values():
            path = os.path.join(RAW_DIR, f"{name}.xpt")
            if os.path.exists(path):
                continue
            req = urllib.request.Request(BASE_URL.format(year=cyc["year"], name=name),
                                         headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=120) as r, open(path, "wb") as f:
                f.write(r.read())
            print(f"  got {name}.xpt ({os.path.getsize(path) / 1e6:.1f} MB)")


def read_xpt(name):
    path = os.path.join(RAW_DIR, f"{name}.xpt")
    if not os.path.exists(path):
        sys.exit(f"Missing {path}. Run without --no-download first.")
    df = pd.read_sas(path, format="xport")
    df.columns = [c.upper() for c in df.columns]
    for c in df.columns:
        if not pd.api.types.is_numeric_dtype(df[c]):
            df[c] = df[c].apply(lambda v: v.decode().strip() if isinstance(v, bytes) else v)
    num = df.select_dtypes("number").columns
    df[num] = df[num].mask(df[num].abs() < 1e-30, 0.0)   # XPT zero = 5.4e-79
    df["SEQN"] = df["SEQN"].astype("int64")
    return df


def col(df, name):
    return pd.to_numeric(df[name], errors="coerce") if name in df.columns else pd.Series(np.nan, index=df.index)


def na(s, codes):
    return s.where(~s.isin(codes))


def yes_no(s):
    return na(s, [7, 9]).map({1: 1.0, 2: 0.0})


def build_cycle(key):
    cfg = CYCLES[key]
    df = read_xpt(cfg["files"]["demo"])
    for comp, name in cfg["files"].items():
        if comp != "demo":
            df = df.merge(read_xpt(name), on="SEQN", how="left", suffixes=("", f"_{comp}"))

    out = pd.DataFrame({"seqn": df["SEQN"], "cycle": key})
    out["weight"] = col(df, cfg["weight"])

    # demographics + body
    out["age"] = col(df, "RIDAGEYR")
    out["sex_female"] = (col(df, "RIAGENDR") == 2).astype(float)
    out["bmi"] = col(df, "BMXBMI")
    out["waist_cm"] = col(df, "BMXWAIST")
    out["height_cm"] = col(df, "BMXHT")
    out["waist_to_height"] = out["waist_cm"] / out["height_cm"]

    # history questions an ASHA can ask
    out["family_history_dm"] = yes_no(col(df, "MCQ300C"))          # P only
    diq010 = na(col(df, "DIQ010"), [7, 9])
    told_pre = yes_no(col(df, "DIQ160"))
    out["told_prediabetes"] = ((told_pre == 1) | (diq010 == 3)).astype(float)
    out.loc[told_pre.isna() & diq010.isna(), "told_prediabetes"] = np.nan
    out["told_hypertension"] = yes_no(col(df, "BPQ020"))

    # lifestyle (same coding as Model 1)
    smq020, smq040 = na(col(df, "SMQ020"), [7, 9]), na(col(df, "SMQ040"), [7, 9])
    smoke = pd.Series(np.nan, index=df.index)
    smoke[smq020 == 2] = 0
    smoke[(smq020 == 1) & (smq040 == 3)] = 1
    smoke[(smq020 == 1) & smq040.isin([1, 2])] = 2
    out["smoking_status"] = smoke

    alq111, alq121 = na(col(df, "ALQ111"), [7, 9]), na(col(df, "ALQ121"), [77, 99])
    days = alq121.map(ALQ121_DAYS)
    days[alq111 == 2] = 0
    out["alcohol_days_per_year"] = days

    if key == "P":
        vig = na(col(df, "PAQ655"), [77, 99]) * na(col(df, "PAD660"), [7777, 9999])
        mod = na(col(df, "PAQ670"), [77, 99]) * na(col(df, "PAD675"), [7777, 9999])
        vig[na(col(df, "PAQ650"), [7, 9]) == 2] = 0
        mod[na(col(df, "PAQ665"), [7, 9]) == 2] = 0
    else:
        def weekly(q, u, m):
            freq = na(col(df, q), [7777, 9999])
            per_week = freq * (df[u].map(UNIT_PER_WEEK) if u in df.columns else np.nan)
            per_week[freq == 0] = 0
            total = per_week * na(col(df, m), [7777, 9999])
            total[per_week == 0] = 0
            return total
        mod, vig = weekly("PAD790Q", "PAD790U", "PAD800"), weekly("PAD810Q", "PAD810U", "PAD820")
    out["leisure_mvpa_min_wk"] = (mod.clip(upper=5000) + 2 * vig.clip(upper=5000))
    out["sedentary_min_day"] = na(col(df, "PAD680"), [7777, 9999])
    out["sleep_hours"] = col(df, "SLD012")

    # ---- LABEL (ref_* never used as features)
    out["ref_hba1c"] = col(df, "LBXGH")
    out["ref_dx_diabetes"] = (diq010 == 1).astype(float)
    out["ref_on_dm_meds"] = ((yes_no(col(df, "DIQ050")) == 1) | (yes_no(col(df, "DIQ070")) == 1)).astype(float)
    known = (out["ref_dx_diabetes"] == 1) | (out["ref_on_dm_meds"] == 1)
    out["ref_known_diabetes"] = known.astype(int)
    out["dm"] = (known | (out["ref_hba1c"] >= 6.5)).astype(int)
    out["ref_undiagnosed_dm"] = ((~known) & (out["ref_hba1c"] >= 6.5)).astype(int)
    out["ref_prediabetes_a1c"] = ((~known) & out["ref_hba1c"].between(5.7, 6.4)).astype(int)

    keep = (
        (col(df, "RIDSTATR") == 2)
        & (out["age"] >= 20)
        & (col(df, "RIDEXPRG") != 1)
        & (out["ref_hba1c"].notna() | known)   # need a blood test unless already diagnosed
    )
    out = out[keep].reset_index(drop=True)
    print(f"  cycle {key}: {len(df):,} participants -> {len(out):,} adults kept")
    return out


FEATURES = ["age", "sex_female", "bmi", "waist_cm", "waist_to_height", "family_history_dm",
            "told_prediabetes", "told_hypertension", "smoking_status", "alcohol_days_per_year",
            "leisure_mvpa_min_wk", "sedentary_min_day", "sleep_hours"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-download", action="store_true")
    args = ap.parse_args()
    if not args.no_download:
        print("Downloading missing NHANES files ...")
        download()

    print("Building ...")
    data = pd.concat([build_cycle(k) for k in CYCLES], ignore_index=True)
    os.makedirs(OUT_DIR, exist_ok=True)
    data.to_csv(os.path.join(OUT_DIR, "diabetes_nhanes.csv"), index=False)
    data[data.cycle == "P"].to_csv(os.path.join(OUT_DIR, "diabetes_train.csv"), index=False)
    data[data.cycle == "L"].to_csv(os.path.join(OUT_DIR, "diabetes_external.csv"), index=False)

    print("\nSummary")
    for k, g in data.groupby("cycle"):
        print(f"  {k}: n={len(g):,}  diabetes={g.dm.mean():.1%}  known={g.ref_known_diabetes.mean():.1%}  "
              f"undiagnosed={g.ref_undiagnosed_dm.mean():.1%}  prediabetes(A1c)={g.ref_prediabetes_a1c.mean():.1%}")
    print("\n  Missing % per feature (P / L):")
    for c in FEATURES:
        print(f"    {c:<24} {data.loc[data.cycle == 'P', c].isna().mean():6.1%} / "
              f"{data.loc[data.cycle == 'L', c].isna().mean():6.1%}")
    print(f"\nWrote {OUT_DIR}/diabetes_nhanes.csv ({len(data):,} rows)")
    print("Target = dm  |  ref_* columns are label-related: do NOT train on them.")


if __name__ == "__main__":
    main()