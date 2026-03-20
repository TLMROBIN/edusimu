<template>
  <div class="app-shell-background">
    <div class="app-orb app-orb-a"></div>
    <div class="app-orb app-orb-b"></div>
    <div class="app-grid"></div>
    <router-view />
  </div>
</template>

<script setup>
</script>

<style scoped>
.app-shell-background {
  position: relative;
  min-height: 100vh;
  isolation: isolate;
}

.app-orb,
.app-grid {
  pointer-events: none;
  position: fixed;
  inset: 0;
}

.app-orb {
  filter: blur(80px);
  opacity: 0.6;
  z-index: -3;
}

.app-orb-a {
  inset: 5% auto auto 8%;
  width: 30vw;
  height: 30vw;
  max-width: 420px;
  max-height: 420px;
  background: radial-gradient(circle, rgba(18, 169, 196, 0.26) 0%, rgba(18, 169, 196, 0) 72%);
}

.app-orb-b {
  inset: auto 6% 10% auto;
  width: 36vw;
  height: 36vw;
  max-width: 520px;
  max-height: 520px;
  background: radial-gradient(circle, rgba(22, 97, 255, 0.22) 0%, rgba(22, 97, 255, 0) 72%);
}

.app-grid {
  z-index: -4;
  background:
    linear-gradient(rgba(20, 42, 75, 0.08) 1px, transparent 1px),
    linear-gradient(90deg, rgba(20, 42, 75, 0.08) 1px, transparent 1px);
  background-size: 28px 28px;
  mask-image: linear-gradient(to bottom, rgba(0, 0, 0, 0.3), transparent 92%);
}
</style>
