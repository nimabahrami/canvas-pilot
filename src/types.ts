export type Format = 'md' | 'txt' | 'xml';
export type Provider = 'openai' | 'anthropic' | 'gemini' | 'nvidia' | 'compatible' | 'ollama';
export interface ProviderModel { id: string; name: string }
export interface CaptureContext { kind: 'window' | 'screen' | 'import'; title: string; capturedAt: string; url?: string }
export interface AnnotationMark { tool: string; points: { x: number; y: number }[]; color: string; width: number; text?: string; fontSize?: number }
export interface EditState { baseDataUrl: string; marks: AnnotationMark[]; sealed?: boolean }
export interface SavedImage { revision?: number; id: string; path: string; name: string; width: number; height: number; context?: CaptureContext }
export interface Entry { id: string; createdAt: string; prompt: string; originalPrompt?: string; images: SavedImage[] }
export interface Session { id: string; title: string; createdAt: string; updatedAt: string; folder: string; entries: Entry[]; exportWarning?: string }
export interface Settings { provider: Provider; model: string; baseUrl: string; rootFolder: string; format: Format; hasApiKey: boolean; secureStorage: boolean | null; shortcut: string; }
export interface DraftImage { editState?: EditState; id: string; dataUrl: string; name: string; width: number; height: number; context?: CaptureContext }
export interface AppendPayload { sessionId?: string; title: string; prompt: string; originalPrompt?: string; images: DraftImage[] }
export interface CaptureSource { id: string; name: string; thumbnail: string; kind: 'window' | 'screen' }
export interface CaptureResult { dataUrl: string; context: CaptureContext; savedSession?: Session }
export interface CaptionDraft { image: DraftImage; caption: string; sessionId?: string; sessionTitle: string }
export interface EnhancedEntry { id: string; prompt: string }
export interface JournalEnhancement { session: Session; entries: EnhancedEntry[] }
export interface CaptureAccess { platform: string; status: string; appName: string; appPath: string; packaged: boolean }
export interface Bridge {
  readonly isDesktop: boolean;
  readonly platform: string;
  init(): Promise<{ sessions: Session[]; settings: Settings }>;
  append(payload: AppendPayload): Promise<Session>;
  rename(id: string, title: string): Promise<Session>;
  removeEntry(sessionId: string, entryId: string): Promise<Session>;
  deleteSession(id: string): Promise<void>;
  imageForEdit(sessionId: string, imageId: string): Promise<DraftImage>;
  updateImage(sessionId: string, imageId: string, image: DraftImage): Promise<Session>;
  image(sessionId: string, imageId: string): Promise<string>;
  exportJournal(id: string, format: Format): Promise<string | null>;
  openFolder(id: string): Promise<void>;
  copy(text: string): Promise<void>;
  captureSources(): Promise<CaptureSource[]>;
  captureAccess(): Promise<CaptureAccess>;
  openCaptureSettings(): Promise<void>;
  revealApplication(): Promise<void>;
  restart(): Promise<void>;
  hide(): Promise<void>;
  openCopyPicker(): Promise<void>;
  capture(id: string, target?: { sessionId?: string; title?: string }): Promise<CaptureResult | null>;
  saveSettings(settings: Partial<Settings> & { apiKey?: string; clearApiKey?: boolean }): Promise<Settings>;
  listModels(input: { provider: Provider; baseUrl: string; apiKey?: string; clearApiKey?: boolean }): Promise<ProviderModel[]>;
  chooseFolder(): Promise<string | null>;
  enhance(sessionId: string, format: Format): Promise<JournalEnhancement>;
  applyEnhancement(sessionId: string, updatedAt: string, entries: EnhancedEntry[] | null): Promise<Session>;
  onCaptureRequested(callback: () => void): () => void;
}
export interface QuickCopySnapshot {
  sessions: { id: string; title: string; entries: number }[];
  format: Format;
}
export interface QuickCopyBridge {
  list(): Promise<QuickCopySnapshot>;
  copy(id: string, format?: Format): Promise<void>;
  close(): Promise<void>;
  onShow(callback: () => void): () => void;
  onHide(callback: () => void): () => void;
}
declare global { interface Window { canvasPilot?: Bridge; quickCopy?: QuickCopyBridge; } }
