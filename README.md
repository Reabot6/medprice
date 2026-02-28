# MedPrice AI 💊

MedPrice AI is a comprehensive pharmacy transparency and prescription management tool built for the AdvanceHealth Hackathon. It helps users find the cheapest medication prices nearby, manage their prescriptions, and optimize their healthcare spending using AI-powered analysis and real-time grounding.

## ✨ Features

- **Medication Scanning:** Scan medication boxes or prescriptions using your device's camera.
- **AI-Powered Analysis:** Uses Gemini AI with OCR to identify drug names, dosages, and quantities.
- **Price Comparison:** Real-time price comparison across major pharmacy chains (Boots, LloydsPharmacy, etc.) using Google Search Grounding.
- **Generic Alternatives:** Identifies generic versions of medications and calculates potential savings.
- **Medication Basket:** Add multiple items to a basket to find the cheapest total cost for your entire prescription.
- **Pharmacy Checkout:** Select a pharmacy, review your items, and simulate a reservation.
- **My Prescriptions:** Save recurring medications for quick access and one-click basket refills.
- **Search History:** Automatically saves your last 10 searches for easy reference.
- **Map Integration:** View nearby pharmacies directly on Google Maps with integrated grounding.
- **Share & Print:** Share results with caregivers or print a clean summary for your pharmacist.

## 🚀 Getting Started

Follow these instructions to get a copy of the project up and running on your local machine for development and testing purposes.

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or higher recommended)
- [npm](https://www.npmjs.com/) (comes with Node.js)
- A [Google Gemini API Key](https://aistudio.google.com/app/apikey)

### Installation

1. **Clone the repository:**
   ```bash
   git clone <your-repo-url>
   cd medprice-ai
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Set up environment variables:**
   Create a `.env` file in the root directory and add your Gemini API key:
   ```env
   GEMINI_API_KEY=your_api_key_here
   VITE_GEMINI_API_KEY=your_api_key_here
   ```
   *Note: In this specific project structure, `process.env.GEMINI_API_KEY` is used. For local Vite development, you might need the `VITE_` prefix depending on your configuration.*

### Running the Application

1. **Start the development server:**
   ```bash
   npm run dev
   ```

2. **Open your browser:**
   Navigate to `http://localhost:3000` to see the application running.

### Building for Production

To create a production-ready build:
```bash
npm run build
```
The optimized files will be generated in the `dist/` directory.

## 🛠️ Technologies Used

- **Frontend:** React 19, Vite, Tailwind CSS
- **AI Engine:** Google Gemini API (`@google/genai`)
- **Icons:** Lucide React
- **Animations:** Motion (Framer Motion)
- **Styling:** Tailwind CSS (v4)

## 📱 Usage Guide

1. **Search:** Type a medication name in the search bar or click the camera icon to scan a box/prescription.
2. **Analyze:** Review the AI-generated price comparison, dosage info, and generic alternatives.
3. **Save:** Click the checkmark icon to save a medication to "My Prescriptions."
4. **Basket:** Click the plus (+) icon to add items to your basket.
5. **Checkout:** Open the basket, select a pharmacy, and click "Confirm Reservation" to see the final summary.
6. **History:** Access your recent searches via the clock icon in the header.

## 📄 License

This project is licensed under the Apache-2.0 License.
