import { NightPulseHud } from "./night-pulse-hud";
import { NightPulseLayer } from "./night-pulse-layer";
import type { ComponentProps } from "react";

export default function NightPulse(layer: ComponentProps<typeof NightPulseLayer>) {
  return <>
    <NightPulseLayer {...layer} />
    <NightPulseHud />
  </>;
}
