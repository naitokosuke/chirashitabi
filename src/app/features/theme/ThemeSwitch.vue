<script setup lang="ts" vapor>
import { computed, useId } from "vue";

import { CtDockItem } from "../../../ui/index";

import { useI18n } from "../../i18n/useI18n";

import { useTheme } from "./useTheme";

/**
 * Light or dark, in the dock. The icon is the theme that is up: a sun, whose rays fold away
 * and whose disc swells and is bitten into a crescent as it turns to night, and back. The new
 * colors spread from the icon over the screen (useTheme).
 */
const theme = useTheme();
const i18n = useI18n();
const mask = useId();
const night = computed(() => theme.theme === "dark");

function toggle(e: MouseEvent) {
  // from the icon's middle, whether it was clicked, tapped or pressed with the keyboard
  const item = (e.target as Element | null)?.closest("[data-dock-item]");
  const r = item?.getBoundingClientRect();
  theme.toggle(r === undefined ? undefined : { x: r.left + r.width / 2, y: r.top + r.height / 2 });
}
/**
 * The eight rays as one path: Vapor builds the children of a v-for inside an <svg> as HTML
 * elements, which draw nothing, so they are not a v-for
 */
const RAYS = Array.from({ length: 8 }, (_, i) => {
  const a = (i * Math.PI) / 4;
  const at = (r: number) =>
    `${(12 + Math.cos(a) * r).toFixed(2)} ${(12 + Math.sin(a) * r).toFixed(2)}`;
  return `M${at(8)}L${at(10.5)}`;
}).join("");
</script>

<template>
  <CtDockItem :label="i18n.t(night ? 'theme.toLight' : 'theme.toDark')" @click="toggle">
    <svg
      aria-hidden="true"
      height="24"
      viewBox="0 0 24 24"
      width="24"
      :data-night="night || undefined"
    >
      <mask :id="mask">
        <rect fill="#fff" height="24" width="24" />
        <circle class="bite" cx="17.5" cy="6.5" fill="#000" r="6.5" />
      </mask>
      <circle class="disc" cx="12" cy="12" fill="currentColor" r="9" :mask="`url(#${mask})`" />
      <path
        class="rays"
        fill="none"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-width="2"
        :d="RAYS"
      />
    </svg>
  </CtDockItem>
</template>

<style scoped>
@import "../../../ui/styles/media.css";

svg {
  overflow: visible;

  > circle,
  > path,
  .bite {
    transform-origin: 12px 12px;
    transition:
      scale 0.55s var(--ease-spring),
      translate 0.55s var(--ease-morph),
      rotate 0.55s var(--ease-morph),
      opacity 0.3s ease;

    @media (--reduced-motion) {
      transition: none;
    }
  }

  /* day: a small disc, the bite far off, the rays out */
  .disc {
    scale: 0.52;
  }
  .bite {
    translate: 12px -12px;
  }

  /* night: the disc full, bitten into a crescent; the rays turned and folded into it */
  &[data-night] {
    .disc {
      scale: 1;
    }
    .bite {
      translate: 0 0;
    }
    .rays {
      scale: 0.4;
      rotate: -90deg;
      opacity: 0;
    }
  }
}
</style>
