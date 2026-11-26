// User HTML runs with an opaque origin, never with the platform's origin or tokens.
export const SIMULATOR_SANDBOX='allow-scripts allow-modals';
export function mountSimulator(frame,html,title){
 frame.title=title;frame.setAttribute('sandbox',SIMULATOR_SANDBOX);frame.referrerPolicy='no-referrer';
 const policy="default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' https: blob:; style-src 'unsafe-inline' https:; img-src https: data: blob:; font-src https: data:; media-src https: data: blob:; connect-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'";
 frame.srcdoc=`<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${policy}">`+html;
}
