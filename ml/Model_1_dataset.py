#!/usr/bin/env python3
"""
HA-01 · Model 1 (Hypertension risk) — dataset builder

Downloads NHANES 2017–Mar 2020 (pre-pandemic, "P") and Aug 2021–2023 ("L"),
merges all components on SEQN, cleans NHANES special codes, harmonizes the
two cycles and writes ONE combined CSV:

    data/hypertension_nhanes.csv     (both cycles, column `cycle` = P or L)
    data/hypertension_train.csv      (P cycle  -> train / validate)
    data/hypertension_external.csv   (L cycle  -> external test)

Usage:
    pip install pandas numpy
    python build_hypertension_dataset.py              # download + build
    python build_hypertension_dataset.py --no-download  # build from data/nhanes/*.xpt

Target `htn` = 1 if mean SBP >= 140 OR mean DBP >= 90 OR on BP medication.
Columns starting with `ref_` define/describe the label -> NEVER use as features.
"""
import argparse
import os
import sys
import urllib.request

import numpy as np
import pandas as pd

BASE = "/run/media/pravesh/New Volume/Promethius-26/datasets"
RAW_DIR = os.path.join(BASE, "nhanes")
OUT_DIR = BASE

CYCLES = {
    "P": {
        "year": "2017",
        "files": {
            "demo": "P_DEMO", "bpxo": "P_BPXO", "bpq": "P_BPQ", "bmx": "P_BMX",
            "smq": "P_SMQ", "alq": "P_ALQ", "paq": "P_PAQ", "diq": "P_DIQ", "slq": "P_SLQ",
        },
        "weight": "WTMECPRP",
        "med": "BPQ050A",   # Now taking prescribed medicine for HBP
    },
    "L": {
        "year": "2021",
        "files": {
            "demo": "DEMO_L", "bpxo": "BPXO_L", "bpq": "BPQ_L", "bmx": "BMX_L",
            "smq": "SMQ_L", "alq": "ALQ_L", "paq": "PAQ_L", "diq": "DIQ_L", "slq": "SLQ_L",
        },
        "weight": "WTMEC2YR",
        "med": "BPQ150",    # Taking high blood pressure medication
    },
}

BASE_URL = "https://wwwn.cdc.gov/Nchs/Data/Nhanes/Public/{year}/DataFiles/{name}.xpt"

# ALQ121 "past 12 months how often drink" -> approx drinking days per year
ALQ121_DAYS = {0: 0, 1: 365, 2: 286, 3: 182, 4: 104, 5: 52, 6: 30, 7: 12, 8: 9, 9: 4.5, 10: 1.5}
# PAD790U / PAD810U unit -> multiplier to "times per week"
UNIT_PER_WEEK = {"D": 7.0, "W": 1.0, "M": 12 / 52, "Y": 1 / 52}


# ----------------------------------------------------------------------------- io
def download(force=False):
    os.makedirs(RAW_DIR, exist_ok=True)
    for cyc in CYCLES.values():
        for name in cyc["files"].values():
            path = os.path.join(RAW_DIR, f"{name}.xpt")
            if os.path.exists(path) and not force:
                print(f"  have  {name}.xpt")
                continue
            url = BASE_URL.format(year=cyc["year"], name=name)
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=120) as r, open(path, "wb") as f:
                f.write(r.read())
            print(f"  got   {name}.xpt  ({os.path.getsize(path) / 1e6:.1f} MB)")


def read_xpt(name):
    path = os.path.join(RAW_DIR, f"{name}.xpt")
    if not os.path.exists(path):
        sys.exit(f"Missing {path}. Run without --no-download first.")
    df = pd.read_sas(path, format="xport")
    df.columns = [c.upper() for c in df.columns]
    # XPT text columns come back as bytes -> decode
    for c in df.columns:
        if not pd.api.types.is_numeric_dtype(df[c]):
            df[c] = df[c].apply(lambda v: v.decode().strip() if isinstance(v, bytes) else v)
    # NHANES XPT stores 0 as 5.4e-79 -> snap to exact zero
    num = df.select_dtypes("number").columns
    df[num] = df[num].mask(df[num].abs() < 1e-30, 0.0)
    df["SEQN"] = df["SEQN"].astype("int64")
    return df


def col(df, name):
    """Return column as float Series, or all-NaN if the column is absent."""
    if name in df.columns:
        return pd.to_numeric(df[name], errors="coerce")
    return pd.Series(np.nan, index=df.index)


def na_codes(s, codes):
    return s.where(~s.isin(codes))


# ------------------------------------------------------------------ per-cycle build
def build_cycle(key):
    cfg = CYCLES[key]
    f = cfg["files"]
    demo = read_xpt(f["demo"])
    df = demo
    for comp in ["bpxo", "bpq", "bmx", "smq", "alq", "paq", "diq", "slq"]:
        df = df.merge(read_xpt(f[comp]), on="SEQN", how="left", suffixes=("", f"_{comp}"))

    out = pd.DataFrame({"seqn": df["SEQN"], "cycle": key})

    # ---- survey design
    out["weight"] = col(df, cfg["weight"])
    out["psu"] = col(df, "SDMVPSU")
    out["strata"] = col(df, "SDMVSTRA")

    # ---- demographics
    out["age"] = col(df, "RIDAGEYR")
    out["sex_female"] = (col(df, "RIAGENDR") == 2).astype(float)
    out["education"] = na_codes(col(df, "DMDEDUC2"), [7, 9])  # 1..5, adults 20+

    # ---- body measures
    out["height_cm"] = col(df, "BMXHT")
    out["weight_kg"] = col(df, "BMXWT")
    out["bmi"] = col(df, "BMXBMI")
    out["waist_cm"] = col(df, "BMXWAIST")
    out["waist_to_height"] = out["waist_cm"] / out["height_cm"]

    # ---- smoking: 0 never, 1 former, 2 current
    smq020 = na_codes(col(df, "SMQ020"), [7, 9])
    smq040 = na_codes(col(df, "SMQ040"), [7, 9])
    smoke = pd.Series(np.nan, index=df.index)
    smoke[smq020 == 2] = 0
    smoke[(smq020 == 1) & (smq040 == 3)] = 1
    smoke[(smq020 == 1) & smq040.isin([1, 2])] = 2
    out["smoking_status"] = smoke

    # ---- alcohol: drinking days per year
    alq111 = na_codes(col(df, "ALQ111"), [7, 9])
    alq121 = na_codes(col(df, "ALQ121"), [77, 99])
    days = alq121.map(ALQ121_DAYS)
    days[alq111 == 2] = 0  # never drank
    out["alcohol_days_per_year"] = days
    drinks = na_codes(col(df, "ALQ130"), [777, 999])
    drinks[days == 0] = 0
    out["alcohol_drinks_per_day"] = drinks

    # ---- physical activity (leisure), harmonized to minutes/week
    if key == "P":
        vig_yes = na_codes(col(df, "PAQ650"), [7, 9])
        mod_yes = na_codes(col(df, "PAQ665"), [7, 9])
        vig = na_codes(col(df, "PAQ655"), [77, 99]) * na_codes(col(df, "PAD660"), [7777, 9999])
        mod = na_codes(col(df, "PAQ670"), [77, 99]) * na_codes(col(df, "PAD675"), [7777, 9999])
        vig[vig_yes == 2] = 0
        mod[mod_yes == 2] = 0
    else:
        def weekly(q, u, m):
            freq = na_codes(col(df, q), [7777, 9999])
            unit = df[u].map(UNIT_PER_WEEK) if u in df.columns else pd.Series(np.nan, index=df.index)
            per_week = freq * unit
            per_week[freq == 0] = 0
            mins = na_codes(col(df, m), [7777, 9999])
            total = per_week * mins
            total[per_week == 0] = 0
            return total
        mod = weekly("PAD790Q", "PAD790U", "PAD800")
        vig = weekly("PAD810Q", "PAD810U", "PAD820")
    out["leisure_mod_min_wk"] = mod.clip(upper=5000)
    out["leisure_vig_min_wk"] = vig.clip(upper=5000)
    # WHO: 1 vigorous minute ~ 2 moderate minutes
    out["leisure_mvpa_min_wk"] = out["leisure_mod_min_wk"] + 2 * out["leisure_vig_min_wk"]
    out["meets_who_activity"] = (out["leisure_mvpa_min_wk"] >= 150).astype(float)
    out.loc[out["leisure_mvpa_min_wk"].isna(), "meets_who_activity"] = np.nan
    out["sedentary_min_day"] = na_codes(col(df, "PAD680"), [7777, 9999])

    # ---- known diabetes (self-report)
    diq = na_codes(col(df, "DIQ010"), [7, 9])
    out["known_diabetes"] = (diq == 1).astype(float)
    out["borderline_diabetes"] = (diq == 3).astype(float)
    out.loc[diq.isna(), ["known_diabetes", "borderline_diabetes"]] = np.nan

    # ---- sleep
    out["sleep_hours"] = col(df, "SLD012")

    # ---- LABEL (ref_* columns: never use as model features)
    sbp = df[[c for c in ["BPXOSY1", "BPXOSY2", "BPXOSY3"] if c in df.columns]].apply(pd.to_numeric, errors="coerce")
    dbp = df[[c for c in ["BPXODI1", "BPXODI2", "BPXODI3"] if c in df.columns]].apply(pd.to_numeric, errors="coerce")
    out["ref_n_bp_readings"] = sbp.notna().sum(axis=1)
    out["ref_sbp_mean"] = sbp.mean(axis=1)
    out["ref_dbp_mean"] = dbp.mean(axis=1)
    med = na_codes(col(df, cfg["med"]), [7, 9])
    out["ref_on_bp_meds"] = (med == 1).astype(float)
    told = na_codes(col(df, "BPQ020"), [7, 9])
    out["ref_told_htn"] = told.map({1: 1.0, 2: 0.0})

    out["htn"] = (
        (out["ref_sbp_mean"] >= 140) | (out["ref_dbp_mean"] >= 90) | (out["ref_on_bp_meds"] == 1)
    ).astype(int)
    # undiagnosed = hypertensive by measurement, never told, not on meds
    out["ref_undiagnosed_htn"] = (
        (out["htn"] == 1) & (out["ref_told_htn"] == 0) & (out["ref_on_bp_meds"] == 0)
    ).astype(int)

    # ---- exclusions
    n0 = len(out)
    keep = (
        (col(df, "RIDSTATR") == 2)              # examined at MEC
        & (out["age"] >= 18)
        & (col(df, "RIDEXPRG") != 1)            # not pregnant
        & (out["ref_n_bp_readings"] >= 1)       # has measured BP
    )
    out = out[keep].reset_index(drop=True)
    print(f"  cycle {key}: {n0} participants -> {len(out)} adults kept")
    return out


FEATURES = [
    "age", "sex_female", "education", "height_cm", "weight_kg", "bmi", "waist_cm",
    "waist_to_height", "smoking_status", "alcohol_days_per_year", "alcohol_drinks_per_day",
    "leisure_mod_min_wk", "leisure_vig_min_wk", "leisure_mvpa_min_wk", "meets_who_activity",
    "sedentary_min_day", "known_diabetes", "borderline_diabetes", "sleep_hours",
]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-download", action="store_true")
    ap.add_argument("--force", action="store_true", help="re-download files")
    args = ap.parse_args()

    if not args.no_download:
        print("Downloading NHANES files ...")
        download(force=args.force)

    print("Building ...")
    parts = [build_cycle(k) for k in CYCLES]
    data = pd.concat(parts, ignore_index=True)

    os.makedirs(OUT_DIR, exist_ok=True)
    data.to_csv(os.path.join(OUT_DIR, "hypertension_nhanes.csv"), index=False)
    data[data.cycle == "P"].to_csv(os.path.join(OUT_DIR, "hypertension_train.csv"), index=False)
    data[data.cycle == "L"].to_csv(os.path.join(OUT_DIR, "hypertension_external.csv"), index=False)

    print("\nSummary")
    for k, g in data.groupby("cycle"):
        w = g["weight"]
        wprev = np.average(g["htn"], weights=w) if w.notna().all() and w.sum() > 0 else float("nan")
        print(f"  {k}: n={len(g):,}  htn={g.htn.mean():.1%} (weighted {wprev:.1%})  "
              f"undiagnosed={g.ref_undiagnosed_htn.mean():.1%}")
    print("\n  Missing % per feature (P / L):")
    for c in FEATURES:
        p = data.loc[data.cycle == "P", c].isna().mean()
        l = data.loc[data.cycle == "L", c].isna().mean()
        print(f"    {c:<24} {p:6.1%} / {l:6.1%}")
    print(f"\nWrote {OUT_DIR}/hypertension_nhanes.csv  ({len(data):,} rows, {data.shape[1]} cols)")
    print("Model features =", FEATURES)
    print("Target = htn   |   ref_* columns are label-related: do NOT train on them.")


if __name__ == "__main__":
    main()