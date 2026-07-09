import { Component, type ReactNode } from 'react';

/** Per-panel error boundary: a single panel that throws (a bad selector value, a NaN, a missing
 *  field) renders an honest inline message instead of blanking the whole app. Every tab panel is
 *  wrapped in one so no local failure can take the page down (#78). */
export class PanelBoundary extends Component<{ children: ReactNode; label?: string }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidUpdate(prev: { children: ReactNode; label?: string }) {
    // reset the boundary when the panel content changes (e.g. the user switches case/policy),
    // so a recovered selector value re-renders normally instead of staying stuck on the error.
    if (this.state.error && prev.children !== this.props.children) this.setState({ error: null });
  }

  render() {
    if (this.state.error) {
      return (
        <div className="dl-panel" role="alert" style={{ borderColor: '#f85149' }}>
          <div className="dl-panel-t" style={{ color: '#f85149' }}>{this.props.label ?? 'This panel could not render'}</div>
          <p className="dl-hint small">
            This view hit an error for the current selection and was isolated so the rest of the app keeps working.
            Try another case or policy.
          </p>
          <p className="dl-hint small mono" style={{ opacity: 0.7 }}>{this.state.error.message}</p>
        </div>
      );
    }
    return this.props.children;
  }
}
