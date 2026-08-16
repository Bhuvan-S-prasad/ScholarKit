import React from "react";
import { render } from "ink";
import { App, TabId } from "./App.js";

export interface LaunchTuiOptions {
  initialTab?: TabId | "newsletters";
}

export async function launchTui(options: LaunchTuiOptions = {}): Promise<void> {
  const instance = render(<App initialTab={options.initialTab} />);
  await instance.waitUntilExit();
}

export * from "./App.js";
