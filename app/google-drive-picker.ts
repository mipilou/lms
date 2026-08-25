export type DrivePickedFile = {
  id: string;
  name: string;
  url: string;
  mimeType: string;
};

type GoogleTokenResponse = { access_token?: string; error?: string };
type GooglePickerDocument = { id?: string; name?: string; url?: string; mimeType?: string };
type GooglePickerData = { action?: string; docs?: GooglePickerDocument[] };
type TokenClient = { requestAccessToken: (options?: { prompt?: string }) => void };
type PickerBuilder = {
  addView: (view: unknown) => PickerBuilder;
  setOAuthToken: (token: string) => PickerBuilder;
  setDeveloperKey: (key: string) => PickerBuilder;
  setAppId: (id: string) => PickerBuilder;
  setCallback: (callback: (data: GooglePickerData) => void) => PickerBuilder;
  build: () => { setVisible: (visible: boolean) => void };
};
type PickerView = { setIncludeFolders: (value: boolean) => PickerView; setSelectFolderEnabled: (value: boolean) => PickerView };
type GoogleDriveWindow = Window & {
  gapi?: { load: (name: string, options: { callback: () => void; onerror: () => void }) => void };
  google?: {
    accounts?: { oauth2?: { initTokenClient: (options: { client_id: string; scope: string; callback: (response: GoogleTokenResponse) => void; error_callback: () => void }) => TokenClient } };
    picker?: {
      Action: { PICKED: string; CANCEL: string };
      DocsView: new () => PickerView;
      PickerBuilder: new () => PickerBuilder;
    };
  };
};

const clientId = process.env.NEXT_PUBLIC_GOOGLE_DRIVE_CLIENT_ID ?? "";
const apiKey = process.env.NEXT_PUBLIC_GOOGLE_DRIVE_API_KEY ?? "";
const appId = process.env.NEXT_PUBLIC_GOOGLE_DRIVE_APP_ID ?? "";

export function googleDriveConfigured() {
  return Boolean(clientId && apiKey && appId);
}

function loadScript(id: string, source: string) {
  return new Promise<void>((resolve, reject) => {
    const existing = document.getElementById(id) as HTMLScriptElement | null;
    if (existing?.dataset.loaded === "true") { resolve(); return; }
    if (existing) { existing.addEventListener("load", () => resolve(), { once: true }); existing.addEventListener("error", () => reject(new Error("Chargement Google Drive impossible.")), { once: true }); return; }
    const script = document.createElement("script");
    script.id = id; script.src = source; script.async = true; script.defer = true;
    script.addEventListener("load", () => { script.dataset.loaded = "true"; resolve(); }, { once: true });
    script.addEventListener("error", () => reject(new Error("Chargement Google Drive impossible.")), { once: true });
    document.head.appendChild(script);
  });
}

async function loadGoogleLibraries() {
  await Promise.all([
    loadScript("walyah-google-identity", "https://accounts.google.com/gsi/client"),
    loadScript("walyah-google-api", "https://apis.google.com/js/api.js"),
  ]);
  const provider = window as GoogleDriveWindow;
  if (!provider.gapi || !provider.google?.accounts?.oauth2) throw new Error("Les services Google n’ont pas pu être initialisés.");
  await new Promise<void>((resolve, reject) => provider.gapi?.load("picker", { callback: resolve, onerror: () => reject(new Error("Le sélecteur Google Drive est indisponible.")) }));
}

function requestDriveToken() {
  return new Promise<string>((resolve, reject) => {
    const provider = window as GoogleDriveWindow;
    const oauth = provider.google?.accounts?.oauth2;
    if (!oauth) { reject(new Error("Google Identity est indisponible.")); return; }
    const tokenClient = oauth.initTokenClient({
      client_id: clientId,
      scope: "https://www.googleapis.com/auth/drive.file",
      callback: (response) => response.access_token ? resolve(response.access_token) : reject(new Error(response.error || "Autorisation Google Drive refusée.")),
      error_callback: () => reject(new Error("La connexion Google Drive a été fermée ou refusée.")),
    });
    tokenClient.requestAccessToken({ prompt: "consent" });
  });
}

export async function pickGoogleDriveFile(): Promise<DrivePickedFile> {
  if (!googleDriveConfigured()) throw new Error("Google Drive doit d’abord être configuré dans les variables Netlify.");
  await loadGoogleLibraries();
  const token = await requestDriveToken();
  const provider = window as GoogleDriveWindow;
  const pickerApi = provider.google?.picker;
  if (!pickerApi) throw new Error("Le sélecteur Google Drive est indisponible.");
  return new Promise<DrivePickedFile>((resolve, reject) => {
    const view = new pickerApi.DocsView().setIncludeFolders(true).setSelectFolderEnabled(false);
    const picker = new pickerApi.PickerBuilder()
      .addView(view)
      .setOAuthToken(token)
      .setDeveloperKey(apiKey)
      .setAppId(appId)
      .setCallback((data) => {
        if (data.action === pickerApi.Action.CANCEL) { reject(new Error("Sélection Google Drive annulée.")); return; }
        if (data.action !== pickerApi.Action.PICKED) return;
        const document = data.docs?.[0];
        if (!document?.id) { reject(new Error("Aucun fichier Google Drive sélectionné.")); return; }
        resolve({
          id: document.id,
          name: document.name || "Fichier Google Drive",
          url: document.url || `https://drive.google.com/open?id=${encodeURIComponent(document.id)}`,
          mimeType: document.mimeType || "application/octet-stream",
        });
      })
      .build();
    picker.setVisible(true);
  });
}
