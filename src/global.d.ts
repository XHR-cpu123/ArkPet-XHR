import type { DeskPetApi } from "./types";

declare global {
  interface Window {
    deskPet: DeskPetApi;
  }
}

export {};
