export default defineNitroPlugin((nitroApp) => {
  // Hook name from nitro's cloudflare_durable preset.
  nitroApp.hooks.hook('cloudflare:durable:alarm' as never, (durable: Parameters<typeof refreshSnapshot>[0]) => refreshSnapshot(durable))
})
