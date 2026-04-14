
export interface RecognitionResult {
  text: string;
  confidence: number;
  timestamp: number;
}

export enum AppStatus {
  IDLE = 'IDLE',
  INITIALIZING = 'INITIALIZING',
  RECOGNIZING = 'RECOGNIZING',
  ERROR = 'ERROR'
}

export interface TranslationHistoryItem {
  id: string;
  originalGesture: string;
  translation: string;
  timestamp: Date;
}
