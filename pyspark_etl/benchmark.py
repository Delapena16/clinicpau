# Benchmark script comparing ETL execution time (in seconds) between the
# 500-row baseline dataset and the 10,000-row scaled dataset.

import os
import time
from etl_analytics import run_pyspark_etl_on_dataset
from seed_data import seed_all_datasets


def run_benchmark_comparison():
    data_dir = os.path.join(os.path.dirname(__file__), "data")
    baseline_path = os.path.join(data_dir, "patients_baseline_500.json")
    scaled_path = os.path.join(data_dir, "patients_scaled_10000.json")

    if not os.path.exists(baseline_path) or not os.path.exists(scaled_path):
        seed_all_datasets()

    # Measure 500-row baseline dataset execution time
    start_baseline = time.perf_counter()
    run_pyspark_etl_on_dataset(baseline_path)
    baseline_seconds = round(time.perf_counter() - start_baseline, 4)

    # Measure 10,000-row scaled dataset execution time
    start_scaled = time.perf_counter()
    run_pyspark_etl_on_dataset(scaled_path)
    scaled_seconds = round(time.perf_counter() - start_scaled, 4)

    baseline_throughput = int(500 / max(baseline_seconds, 0.0001))
    scaled_throughput = int(10000 / max(scaled_seconds, 0.0001))

    print("\nDr. Pau Animal Bite Center - PySpark ETL Benchmark Results")
    print("+----------------------------+----------------------+------------------------+")
    print("| Dataset Tier               | Execution Time (sec) | Throughput (rows/sec)  |")
    print("+----------------------------+----------------------+------------------------+")
    print(f"| Baseline (500 records)     | {baseline_seconds:<20.4f} | {baseline_throughput:<22,d} |")
    print(f"| Scaled (10,000 records)    | {scaled_seconds:<20.4f} | {scaled_throughput:<22,d} |")
    print("+----------------------------+----------------------+------------------------+\n")


if __name__ == "__main__":
    run_benchmark_comparison()
