import { useSettings } from "@/app/settings";
import { isListenSound, LISTEN_SOUND_OPTIONS } from "@/audio/listenSounds";
import { FIELD_CLASS } from "@/design/fields";

const PICKER_CLASS = `${FIELD_CLASS} w-36 cursor-pointer pr-8`;

export function ListenSoundPicker() {
  const sound = useSettings((state) => state.listenSound);
  const setPracticeAudio = useSettings((state) => state.setPracticeAudio);
  const hint = LISTEN_SOUND_OPTIONS.find((option) => option.value === sound)?.hint;
  return (
    <select
      name="som-do-ouvir"
      aria-label="Som do Ouvir"
      title={hint}
      className={PICKER_CLASS}
      value={sound}
      onChange={(event) => {
        if (isListenSound(event.target.value)) setPracticeAudio({ listenSound: event.target.value });
      }}
    >
      {LISTEN_SOUND_OPTIONS.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
