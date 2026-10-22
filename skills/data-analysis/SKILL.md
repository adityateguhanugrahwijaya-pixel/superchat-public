---
name: data-analysis
description: Exploratory data analysis, data cleaning, aggregation, statistical summaries, and publication-quality charts using pandas, numpy, matplotlib, and seaborn.
triggers:
  - data
  - analysis
  - chart
  - plot
  - graph
  - eda
  - visualize
  - statistics
dependencies:
  - pandas
  - numpy
  - matplotlib
  - seaborn
---

# Exploratory Data Analysis & Visualization Skill Guide

## Overview
Guidelines for reliable data loading, aggregation, statistical exploration, and publication-quality visualization with pandas and matplotlib/seaborn.

---

## 1. Complete EDA & Plotting Recipe

Always set the non-interactive backend `matplotlib.use('Agg')` before importing `pyplot` to prevent GUI server hangs.

```python
import matplotlib
matplotlib.use('Agg')  # Headless server environment mandate

import matplotlib.pyplot as plt
import seaborn as sns
import pandas as pd
import numpy as np

def analyze_dataset(input_csv="uploads/dataset.csv", output_chart="outputs/analysis_chart.png"):
    # 1. Clean Data Loading
    df = pd.read_csv(input_csv)
    print(f"Dataset Loaded: {df.shape[0]} rows, {df.shape[1]} columns")
    print("\nData Types & Missing Values:")
    print(df.isnull().sum())
    
    # 2. Setup Clean Aesthetic
    sns.set_theme(style="whitegrid", font="sans-serif")
    plt.rcParams['font.size'] = 10
    plt.rcParams['axes.titlesize'] = 14
    plt.rcParams['axes.titleweight'] = 'bold'
    plt.rcParams['axes.labelsize'] = 11
    
    # Create Figure with 2 subplots
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(14, 5.5))
    
    # Subplot 1: Distribution / Histogram or Category Count
    if 'category' in df.columns and 'value' in df.columns:
        cat_summary = df.groupby('category')['value'].mean().sort_values(ascending=False)
        sns.barplot(x=cat_summary.values, y=cat_summary.index, ax=ax1, palette="Blues_r")
        ax1.set_title("Average Value by Category")
        ax1.set_xlabel("Average Value ($)")
        ax1.set_ylabel("Category")
    
    # Subplot 2: Trend / Time-Series or Scatter
    if 'date' in df.columns and 'value' in df.columns:
        df['date'] = pd.to_datetime(df['date'])
        time_trend = df.groupby('date')['value'].sum().reset_index()
        sns.lineplot(data=time_trend, x='date', y='value', ax=ax2, color='#0284c7', linewidth=2.5)
        ax2.set_title("Value Growth Over Time")
        ax2.set_xlabel("Date")
        ax2.set_ylabel("Total Value")
        plt.setp(ax2.get_xticklabels(), rotation=30, ha='right')
        
    plt.tight_layout()
    
    # 3. High-DPI Output
    plt.savefig(output_chart, dpi=150, bbox_inches='tight')
    plt.close()
    print(f"\nAnalysis visual saved to: {output_chart}")

if __name__ == "__main__":
    analyze_dataset()
```

---

## 2. Statistical Analysis & Table Summaries

```python
def print_statistical_summary(df, numeric_cols):
    summary = df[numeric_cols].describe().T
    summary['iqr'] = summary['75%'] - summary['25%']
    print("Statistical Distribution:")
    print(summary[['mean', 'std', 'min', '50%', 'max', 'iqr']].to_markdown())
```

---

## Common Pitfalls
1. **GUI Hanging**: Forgetting `matplotlib.use('Agg')` causes scripts to hang indefinitely trying to open a desktop display.
2. **Missing `plt.close()`**: Failing to call `plt.close()` leaves open figure handles in memory. Always call `plt.close()` after `plt.savefig()`.
3. **Clipped Labels**: Always use `bbox_inches='tight'` when saving figures so axis labels or rotated dates are never truncated.
