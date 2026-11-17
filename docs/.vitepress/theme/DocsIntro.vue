<template>
  <!-- Software documentation. Stone and blueprint / Geist + Geist Mono.
       Compact editorial intro; real CLI commands; no decorative effects or stock assets. -->
  <header class="docs-intro">
    <p class="intro-label">Zeke / Documentation</p>
    <h1>Environment files.<br />In every worktree.</h1>
    <p class="intro-lead">
      A Git hook that copies your local environment files into new worktrees.
      Set it up once, then keep working.
    </p>
    <div class="intro-actions">
      <a class="btn btn--primary" href="#getting-started">Install Zeke <span aria-hidden="true">↗</span></a>
      <a class="intro-source" href="https://github.com/pruven/zeke">View source <span aria-hidden="true">↗</span></a>
    </div>
    <div class="terminal" role="region" aria-label="Zeke command example">
      <div class="terminal-bar"><span class="terminal-mark" aria-hidden="true">›_</span><span>Terminal</span><span class="terminal-runtime">Git + Node.js or Bun</span></div>
      <pre><code><span class="terminal-comment"># Enable once in your project</span>
<span class="terminal-prompt">$</span> zeke install

<span class="terminal-comment"># Your next worktree gets its environment files</span>
<span class="terminal-prompt">$</span> git worktree add ../my-feature -b my-feature
<span class="terminal-result">zeke: copied ".env"
zeke: copied "apps/api/.env.local"</span></code></pre>
    </div>
    <div class="intro-facts"><span>Missing files only</span><span>Nested folders preserved</span><span>No file contents logged</span></div>
  </header>
  <nav class="guide-shortcuts" aria-label="Guide shortcuts">
    <a class="card" href="#commands"><span class="shortcut-index">01 <span aria-hidden="true">↗</span></span><strong>Commands</strong><span>The commands you’ll use most.</span></a>
    <a class="card" href="#configuration"><span class="shortcut-index">02 <span aria-hidden="true">↗</span></span><strong>Configuration</strong><span>Choose the files to copy.</span></a>
    <a class="card" href="#copy-behavior"><span class="shortcut-index">03 <span aria-hidden="true">↗</span></span><strong>Copy behavior</strong><span>Know what stays untouched.</span></a>
  </nav>
</template>
