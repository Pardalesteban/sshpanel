import { hashGradient, initials } from "../lib/utils";

interface Props {
  name: string;
  size?: number;
  connected?: boolean;
}

export function HostAvatar({ name, size = 36, connected }: Props) {
  return (
    <div className="relative flex-shrink-0">
      <div
        className="flex items-center justify-center rounded-md font-medium text-white shadow-sm"
        style={{
          background: hashGradient(name),
          width: size,
          height: size,
          fontSize: size * 0.4,
        }}
      >
        {initials(name)}
      </div>
      {connected !== undefined && (
        <span
          className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-bg-base ${
            connected
              ? "bg-brand-emerald animate-pulse-soft"
              : "bg-text-dim"
          }`}
        />
      )}
    </div>
  );
}
