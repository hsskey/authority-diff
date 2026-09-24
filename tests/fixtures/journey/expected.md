# Journey smoke expected figures

`pnpm smoke:journey` runs the twelve-step API journey on this synthetic fixture against a server with an empty volume and compares its figures with the block below.
The transcripts, spool copies, and policies A, B, and B' are synthetic; B' adds a host-wide `git.example.test/**` to B's trusted remotes, so one Widening group is unexpected.
When a change moves a figure on purpose, the command prints the block of the run to replace this one.

<!-- evidence-numbers
classifier: 0.2.4
snapshot.sessions: 3
snapshot.actions: 18
snapshot.duplicates: 0
snapshot.failed: 0
analyzability.full: 14
analyzability.partial: 3
analyzability.none: 1
policy-a.contentHash: 36aeb353…a0d2
snapshot.evaluated: 18
policy-a.allow: 6
policy-a.ask: 9
policy-a.deny: 3
adoption.ask-groups: 6
adoption.deny-groups: 1
adoption.resultHash: d9b3a37b…ed6e
adoption.groups: 7
conformance.spool-files: 2
conformance.findings: 7
conformance.resultHash: 8cc351df…942f
change-bp.contentHash: 2648730f…04d9
change-bp.changed: 4
change-bp.widening-groups: 3
change-bp.unexpected-groups: 1
change-bp.resultHash: aa9885ff…bd42
change-b.contentHash: e7134289…5588
change-b.changed: 4
change-b.widening-groups: 2
change-b.resultHash: 88118f6e…9860
audit.checked: 3
-->
