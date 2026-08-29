import { definePreset } from "@primeuix/themes";
import Aura from "@primeuix/themes/aura";
import "primeicons/primeicons.css";
import PrimeVue from "primevue/config";
import ConfirmationService from "primevue/confirmationservice";
import ToastService from "primevue/toastservice";
import { createApp } from "vue";
import App from "./App.vue";
import { router } from "./router";
import "./style.css";

const Preset = definePreset(Aura, {
  primitive: {
    borderRadius: { none: "0", xs: "2px", sm: "3px", md: "4px", lg: "6px", xl: "8px" },
  },
  semantic: {
    primary: {
      50: "{zinc.50}",
      100: "{zinc.100}",
      200: "{zinc.200}",
      300: "{zinc.300}",
      400: "{zinc.400}",
      500: "{zinc.500}",
      600: "{zinc.600}",
      700: "{zinc.700}",
      800: "{zinc.800}",
      900: "{zinc.900}",
      950: "{zinc.950}",
    },
    colorScheme: {
      light: {
        primary: { color: "{zinc.900}", contrastColor: "#ffffff", hoverColor: "{zinc.800}", activeColor: "{zinc.700}" },
        highlight: { background: "{zinc.900}", focusBackground: "{zinc.700}", color: "#ffffff", focusColor: "#ffffff" },
        surface: {
          0: "#ffffff",
          50: "{zinc.50}",
          100: "{zinc.100}",
          200: "{zinc.200}",
          300: "{zinc.300}",
          400: "{zinc.400}",
          500: "{zinc.500}",
          600: "{zinc.600}",
          700: "{zinc.700}",
          800: "{zinc.800}",
          900: "{zinc.900}",
          950: "{zinc.950}",
        },
      },
      dark: {
        primary: { color: "{zinc.50}", contrastColor: "{zinc.950}", hoverColor: "{zinc.200}", activeColor: "{zinc.300}" },
        highlight: { background: "rgba(250, 250, 250, .16)", focusBackground: "rgba(250, 250, 250, .24)", color: "rgba(255,255,255,.87)", focusColor: "rgba(255,255,255,.87)" },
        surface: {
          0: "#ffffff",
          50: "{zinc.50}",
          100: "{zinc.100}",
          200: "{zinc.200}",
          300: "{zinc.300}",
          400: "{zinc.400}",
          500: "{zinc.500}",
          600: "{zinc.600}",
          700: "{zinc.700}",
          800: "{zinc.800}",
          900: "{zinc.900}",
          950: "{zinc.950}",
        },
      },
    },
  },
});

createApp(App)
  .use(router)
  .use(PrimeVue, { theme: { preset: Preset, options: { darkModeSelector: ".app-dark", cssLayer: false } } })
  .use(ToastService)
  .use(ConfirmationService)
  .mount("#app");
