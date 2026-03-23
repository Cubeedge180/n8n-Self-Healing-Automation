import os
import sys
import google.generativeai as genai
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

def main():
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        print("Error: GEMINI_API_KEY not found in environment variables.")
        sys.exit(1)

    if len(sys.argv) < 2:
        print("Usage: python gemini_cli.py <prompt>")
        sys.exit(1)

    prompt = sys.argv[1]

    # Configure the API
    genai.configure(api_key=api_key)

    # Use the requested model
    model_name = "gemini-2.0-flash"  # Fallback due to 429 on 3.0

    try:
        model = genai.GenerativeModel(model_name)
        response = model.generate_content(prompt)
        print(response.text)
    except Exception as e:
        print(f"Error communicating with Gemini: {e}")
        # Build in a fallback or just report the error?
        # Reporting error is better so we know if the model name is invalid.
        sys.exit(1)

if __name__ == "__main__":
    main()
