# Memorable Milestones

Opinionated GitHub Actions that puts your milestones on auto-pilot, using memorable emoji names.
You won't have to create or close milestones again.

Creates weekly milestones, rotating between 16 pre-selected and memorable emoji names.

Assigns due dates to milestones (on Thursdays), and closes milestones that are at 100%.

## Milestones

There are 16 weekly milestones. Names and due dates are pre-determined, so there's no setup!

### Due dates

Milestones are weekly and the action will create 7 of them for 7 weeks out. The due dates are each Thursday.

### Names

These milestone names are designed to be easy to remember and distinct. Using emojis triggers the parts
of our brains that are great at remembering pictures!

**What makes these milestones memorable?**

Here is the criteria used to *select* the 16 emojis:

- emoji picture is not too small or zoomed out
- emoji is not distractingly cutesy
- the correct name of the emoji should immediately come to mind when you see it
- knowing the emoji name, should be easy to find emoji and not confuse with another emoji
- shouldn't make you hungry 😂
- no scene-type emojis
- emojis used shouldn't look similar
- should have to do with nature or activities, not electronics
- shouldn't be too positive-associated or negative-associated
- shouldn't be strongly associated with a sprint type, like a 🧹 for cleanup sprint
- One word and ideally less than 3 syllables

**How is order determined?**

Here is the criteria used to *order* the 16 emojis:

- emojis of similar colour should not be next to each other
- ideally, emojis of the same category should not be next to each other (food, activity, nature, animal)
- names of emojis should be in alphabetical order so it's each to recall that apple was before bike

**How is name formatting determined?**

Names are one word and include the emoji and the name. Two spaces are put in between because that formatting
tends to look better on GitHub and on Slack with the Instantish integration.

**Cool, so what are the names?**

Here are the names, followed by first due date (future due dates are a multiple of 16 weeks from then):

`🍎  Apple` - May 14 2020
`🚲  Bike` - May 21 2020
`☕️  Coffee` - May 28 2020
`🦆  Duck` - June 4 2020 (@marissamarym's bday 🧁)
`🥚  Egg` - June 11 2020
`🥏  Frisbee` - June 18 2020
`🍇  Grape` - June 25 2020
`🐴  Horse` - July 2 2020
`🦞  Lobster` - July 9 2020
`🗺  Map` - July 16 2020
`🍊  Orange` - July 23 2020
`🦔  Porcupine` - July 30 2020
`☀️  Sun` - August 6 2020
`🎾  Tennis` - August 13 2020
`☂️  Umbrella` - August 20 2020
`🍉  Watermelon` - August 27 2020

### Usage

Basic (runs every 20 minutes):
```yaml
name: "Memorable milestones"
on:
  schedule:
  - cron: "*/20 * * * *"

jobs:
  memorable-milestones:
    runs-on: ubuntu-latest
    steps:
    - uses: instantish/memorable-milestones@v1.1.0
      with:
        repo-token: ${{ secrets.GITHUB_TOKEN }}
```


See [action.yml](./action.yml) for the full list of options.

### Debugging

To see debug ouput from this action, you must set the secret `ACTIONS_STEP_DEBUG` to `true` in your repository. You can run this action in debug only mode (no actions will be taken on your milestones) by passing `debug-only` `true` as an argument to the action.

### Building and testing

Install the dependencies
```bash
$ npm install
```

Build the typescript and package it for distribution
```bash
$ npm run build && npm run pack
```

Run the tests :heavy_check_mark:
```bash
$ npm test
```

### More Resources

For more resources or tools to make issue tracking easier, check out [Instantish](https://itsinstantish.com) ⚡️

If you have questions about setting this up, feel free to reach out to hi@itsinstantish.com with subject line "Question about GitHub Action" 😊
