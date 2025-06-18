# 🚀 Enhanced Stock Price Prediction with Advanced LSTM

[![Python](https://img.shields.io/badge/Python-3.8%2B-blue.svg)](https://python.org)
[![PyTorch](https://img.shields.io/badge/PyTorch-1.9%2B-red.svg)](https://pytorch.org)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

A state-of-the-art stock price prediction system using **22 technical indicators** and **Advanced LSTM with Attention Mechanism** for enhanced accuracy and professional-grade analysis.

## 🌟 Features

### 📊 **Advanced Technical Analysis**
- **22 comprehensive technical indicators** including SMA, EMA, MACD, RSI, Bollinger Bands
- **Multi-feature data preprocessing** with StandardScaler
- **Professional data visualization** with clean, interactive charts

### 🧠 **Cutting-Edge Deep Learning**
- **Multi-layer LSTM** with attention mechanism
- **Batch normalization** and residual connections
- **Advanced training pipeline** with validation and early stopping
- **Gradient clipping** and learning rate scheduling

### 📈 **Comprehensive Evaluation**
- **R² Score** for variance explanation
- **MAPE, RMSE, MAE** for accuracy assessment
- **Professional visualizations** with error analysis
- **Performance quality interpretation**

## 🛠️ Installation

### Prerequisites
- Python 3.8 or higher
- Git

### Quick Setup

#### Option 1: Automated Setup (Recommended)
```bash
# Run the automated setup script
python setup_project.py
```

#### Option 2: Manual Setup
```bash
# 1. Clone the repository
git clone <your-repo-url>
cd stock-prediction-project

# 2. Create virtual environment
python -m venv stock_env

# 3. Activate virtual environment
# On Windows:
stock_env\Scripts\activate
# On macOS/Linux:
source stock_env/bin/activate

# 4. Install dependencies
pip install -r requirements.txt

# 5. Start Jupyter Notebook
jupyter notebook enhanced_stock_prediction_clean.ipynb
```


## 🚀 Quick Start

### 1. **Configure Your Stock**
```python
# In the notebook, modify these settings:
STOCK_SYMBOL = 'RELIANCE.NS'  # Change to your preferred stock
START_DATE = '2020-01-01'
END_DATE = '2024-01-01'
```

### 2. **Run the Notebook**
- Open `enhanced_stock_prediction_clean.ipynb`
- Run all cells sequentially
- The system will automatically:
  - Download stock data
  - Generate 22 technical indicators
  - Train the advanced LSTM model
  - Provide comprehensive analysis

### 3. **View Results**
The notebook generates:
- **Training history plots**
- **Prediction vs actual charts**
- **Error analysis visualizations**
- **Comprehensive performance metrics**

## 📊 Technical Indicators

| Category | Indicators |
|----------|------------|
| **Moving Averages** | SMA_5, SMA_10, SMA_20, EMA_12, EMA_26 |
| **Momentum** | MACD, MACD_signal, RSI |
| **Volatility** | Bollinger Bands (Upper, Lower, Width), Volatility |
| **Volume** | Volume_SMA, Volume_ratio |
| **Price Ratios** | High_Low_ratio, Close_Open_ratio |

## 🧠 Model Architecture

```
Input: 22 Technical Indicators
    ↓
Multi-Layer LSTM (128 → 64 → 32)
    ↓
Attention Mechanism (8 heads)
    ↓
Batch Normalization
    ↓
Dense Layers with Residual Connections
    ↓
Output: Stock Price Prediction
```

## 📈 Performance Metrics

The system provides comprehensive evaluation:

- **R² Score**: Variance explanation (>0.8 = Very Good)
- **MAPE**: Mean Absolute Percentage Error (<10% = Very Good)
- **RMSE**: Root Mean Square Error
- **MAE**: Mean Absolute Error
- **Error Distribution Analysis**

## 🎯 Usage Examples

### Basic Usage
```python
# The notebook handles everything automatically
# Just run all cells for complete analysis
```

### Custom Configuration
```python
# Modify these parameters in the notebook:
SEQUENCE_LENGTH = 60    # Days of historical data
EPOCHS = 200           # Training epochs
LEARNING_RATE = 0.001  # Learning rate
DROPOUT = 0.3          # Dropout rate
```

## 📋 Requirements

### Core Dependencies
- `numpy>=1.21.0` - Numerical computing
- `pandas>=1.3.0` - Data manipulation
- `torch>=1.9.0` - Deep learning framework
- `scikit-learn>=1.0.0` - Machine learning utilities
- `yfinance>=0.1.70` - Stock data download
- `matplotlib>=3.4.0` - Plotting
- `seaborn>=0.11.0` - Statistical visualization

### Optional Dependencies
- `ta>=0.10.0` - Technical analysis library
- `plotly>=5.0.0` - Interactive visualizations

## 🔧 Troubleshooting

### Common Issues

**1. CUDA/GPU Issues**
```bash
# For CPU-only installation:
pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu
```

**2. yfinance Data Download Issues**
```python
# Try different stock symbols or date ranges
STOCK_SYMBOL = 'AAPL'  # For US stocks
STOCK_SYMBOL = 'RELIANCE.NS'  # For Indian stocks
```

**3. Memory Issues**
```python
# Reduce sequence length or batch size
SEQUENCE_LENGTH = 30  # Instead of 60
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **PyTorch** team for the excellent deep learning framework
- **yfinance** for easy stock data access
- **scikit-learn** for machine learning utilities
- **Matplotlib/Seaborn** for visualization capabilities


**⭐ If this project helped you, please give it a star!**

Made with ❤️ for the trading and ML community
