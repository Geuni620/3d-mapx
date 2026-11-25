import { NightPulseHud } from "./night-pulse-hud";
import { NightPulseLayer } from "./night-pulse-layer";
import type { ComponentProps } from "react";

export default function NightPulse({ replay, ...layer }: ComponentProps<typeof NightPulseLayer> & { replay: string | null }) {
  return <>
    <NightPulseLayer {...layer} />
    <NightPulseHud replay={replay} />
  </>;
}
