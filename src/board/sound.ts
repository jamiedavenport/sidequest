import doneUrl from "~/assets/done.wav?url";

let audio: HTMLAudioElement | undefined;

export function playDoneSound() {
  if (typeof Audio === "undefined") {
    return;
  }

  audio ??= new Audio(doneUrl);
  audio.currentTime = 0;
  void audio.play().catch(() => {});
}
