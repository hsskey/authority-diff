# Change Review known limitations

A review whose replay run ended failed becomes failed on the next read, and in the same transaction the candidate returns from in_review to draft via the withdrawal transition so a new review can be created.
A computing or ready review becomes withdrawn via <!-- ko-product-output -->"검토 철회" on the review screen, and in the same transaction the candidate returns to draft via the same withdrawal transition.
A withdrawn review leaves no decision record and does not count as an open review.
Withdrawing during computing still lets an already started replay run finish, and that result does not change the withdrawn review's status.

The defect where saving a completed replay exceeded the bind-parameter limit of one statement (65,534) was found on the real-corpus journey.
Existing store integration tests stored only a few rows under the limit and did not expose it; a test that now stores 20,000 rows blocks it.

Gate 2 widening-group review (P′ policy: Replay Run of a policy that allows `push`+`trusted_remote` and widens `trustedRemotes` to a host-wide pattern): review time is an agent measurement; no person judged.
