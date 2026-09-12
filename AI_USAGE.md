# AI Usage

I used Claude Code and ChatGPT throughout development for code assistance, debugging, UI
iteration, documentation, and architecture exploration. Core product decisions, the ENSv2
integration, the agent permission model, the Hedera payment flow, testing, and final
implementation were directed, reviewed, tested, and validated.

## What that looked like in practice

The project's `git log` is the real, unedited record of this — every commit was authored by
Claude Code, working through my own requests, corrections, and live testing, not on its own. A
few concrete, checkable examples rather than a general claim:

- Adding dual-asset (HBAR/ADC) bounty rewards required a real contract redeploy. I scoped it
  (creator's choice per bounty, not an HBAR-only swap) and ran the actual `npm run deploy`
  transaction myself — Claude Code's own harness safety controls blocked it from running that
  class of action unsupervised. That's a concrete instance of human-in-the-loop on this project,
  not just an assertion of one.
- Multiple real UI/UX bugs — misaligned form buttons, a race's technical log disappearing the
  instant it finished, a "no bounties yet" message showing before the data had even loaded — were
  caught by using the actual running app, reported, and then fixed.
- The visual design system was only built after I explicitly asked for a redesign away from
  generic defaults, and was reviewed against the running app afterward, not just approved from a
  description.

## Verifying this yourself

Nothing here is a curated summary standing in for the real history — `git log` in this
repository is that history. `SETUP.md` and `TESTING.md` describe how to independently run this
project and verify its behavior on real, non-simulated testnets, the same way it was verified
during development.
