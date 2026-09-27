import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) { return { error }; }

  componentDidUpdate(prev) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }

  render() {
    if (this.state.error) {
      return (
        <div className="panel" role="alert">
          <h2>Something went wrong</h2>
          <p className="sub">This page could not be shown. Try again, or go back to the overview.</p>
          <div className="tools">
            <button type="button" className="btn" onClick={() => this.setState({ error: null })}>Try again</button>
            <a className="btn" href="/">Back to overview</a>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
