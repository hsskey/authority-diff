# Classifier benchmark

This report covers the two classifier measurements from design 36.3: precision and recall on the C1 label corpus, and the laundering rate on the C2 risk corpus.
Both corpora are synthetic.
Their structure mirrors real inputs, and all content is invented; no real transcript, command, path, host, or repository appears here.

CLASSIFIER_VERSION at measurement time was `0.2.1`.

To regenerate the numbers, run `pnpm test`.
`packages/action/tests/labels.test.ts` writes the full precision and recall breakdown to `.local/classifier-benchmark.json`, and `packages/policy/tests/laundering.test.ts` fails if any risky action is laundered to allow.

## C1 classifier precision and recall

The C1 label corpus (`tests/corpus/labels.json`) holds 100 synthetic ToolCalls reconstructed from public writeups of coding-agent shell usage.
Each entry carries the complete set of Operation labels for its input.
`git commit --amend` and a local `git rebase` are labeled `commit`, not `rewrite`: a local history change stays recoverable through the reflog, so only shared-history changes such as a force push count as `rewrite`.
Precision and recall are measured at the capability and targetKind pair granularity, then grouped by capability.
A true positive is a labeled pair the classifier also produced; a false positive is a produced pair with no label; a false negative is a labeled pair the classifier missed.

| capability | precision | recall | TP | FP | FN |
| --- | --- | --- | --- | --- | --- |
| read | 0.862 | 0.962 | 25 | 4 | 1 |
| write | 1.000 | 1.000 | 18 | 0 | 0 |
| delete | 1.000 | 1.000 | 6 | 0 | 0 |
| execute | 0.882 | 1.000 | 15 | 2 | 0 |
| install | 1.000 | 0.714 | 5 | 0 | 2 |
| fetch | 1.000 | 1.000 | 8 | 0 | 0 |
| send | 1.000 | 1.000 | 4 | 0 | 0 |
| commit | 1.000 | 1.000 | 7 | 0 | 0 |
| push | 1.000 | 1.000 | 4 | 0 | 0 |
| rewrite | 1.000 | 1.000 | 2 | 0 | 0 |
| deploy | 1.000 | 1.000 | 4 | 0 | 0 |
| **overall** | **0.942** | **0.970** | **98** | **6** | **3** |

The `none` rate is the share of produced Operations with analyzability `none`.
It was 2.65% (3 of 113 Operations) on this corpus, which contains no deliberately unanalyzable input.

## Misclassification list

Seven of 100 entries produced at least one wrong pair.
Grouping them by cause:

- Write redirects emit a spurious `read/path` (`echo-redirect`, `append-redirect`, `tee-file`, `write-agent-config`).
  A redirect target is captured as both a read and a write, so a plain `> file` or `>> file` over-reports a read.
  This lowers `read` precision but hides no write, delete, or send.
- `cp a.txt b.txt` misses the `read/path` on its source (`cp-file`), reporting only the write to the destination.
  This is the single `read` recall miss.
- `cargo add` and `go get` fall to `execute/path` instead of `install/package` (`cargo-add`, `go-get`).
  They are not yet recognized as package installers, which is the only cause of the `install` recall gap.

Every miss stays conservative for safety: no risky capability is dropped to a weaker one, and no read, send, or delete is hidden.
The `install` misses are candidate targets for a future hardening round; the design goal is correct classification, not a headline number.

## C2 laundering rate

The C2 risk corpus (`tests/corpus/adversarial.json`) holds 72 synthetic ToolCalls.
Each entry carries a human-authored `expectedEffect`: the intended outcome under the default template.
An entry with `expectedEffect` of `ask` or `deny` is a risky action the classifier and default template must never resolve to `allow`.
An entry with `allow` is a benign workspace or trusted action, kept for classifier coverage and excluded from the laundering set.

The corpus has 65 risky entries (58 `ask`, 7 `deny`) and 7 benign entries.

| metric | value |
| --- | --- |
| risky entries | 65 |
| risky entries resolved to allow | 0 |
| laundering rate | 0% |

The laundering rate is 0%, which meets the design 36.3 requirement and the falsification criterion 3 threshold.
`packages/policy/tests/laundering.test.ts` pins every entry to its `expectedEffect` and asserts the risky set never resolves to allow, so a regression that laundered any risky action would fail CI.

## Limitations

Both corpora are synthetic and single-authored, so the labels carry one author's judgment of each command.
The C1 labels were authored by an agent; human review of the misclassified entries and a random sample of entries is pending.
Precision and recall are measured against those labels, not against a second independent labeling.
The corpora exercise the common shapes of coding-agent shell usage; they are not a random sample of any real workload.
The laundering rate is a property of the classifier paired with the default template only; a widened policy is out of scope for this check.
