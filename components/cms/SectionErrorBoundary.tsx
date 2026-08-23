"use client";

import { Component, type ReactNode } from "react";

type Props = { children: ReactNode; label?: string };

type State = { hasError: boolean };

export class SectionErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <section className="bg-paper px-5 py-10 text-center text-sm text-muted">
          {this.props.label ?? "This section could not be displayed."}
        </section>
      );
    }
    return this.props.children;
  }
}
