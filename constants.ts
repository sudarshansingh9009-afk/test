
export const MODEL_NAME = 'gemini-3-flash-preview';
export const FRAME_CAPTURE_INTERVAL = 3000; // Capture every 3 seconds for analysis
export const SYSTEM_PROMPT = `
You are an expert American Sign Language (ASL) interpreter. 
The user will provide a camera frame. 
Your task is to:
1. Identify the sign language gesture or alphabet shown in the image.
2. Translate it into standard English text.
3. If it looks like a sequence of letters, form the word.
4. Output ONLY the translated text or word. Do not include conversational filler or explanations.
5. If no clear gesture is detected, respond with "[No gesture detected]".
`;

export const APP_TITLE = "Manovox";
export const APP_SUBTITLE = "Bridging the gap with AI-powered ASL translation.";
