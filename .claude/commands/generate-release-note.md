Run the full release note flow for the given sprint number or name.

If no sprint name was provided (i.e. $ARGUMENTS is empty):
1. Call the `validate_config` MCP tool to retrieve the current configuration.
2. Extract the `iterationPathPrefix` value from the output.
3. Ask the user which sprint they would like to generate a release note for.
   - Show a preview of the full iteration path that will be queried, e.g.:
     "This will search for work items in: `{iterationPathPrefix}\{sprintName}`"
   - This lets the user confirm the path looks correct before proceeding.

Use the `generate_release_note` MCP tool with the sprint argument: $ARGUMENTS

After the tool responds, display the **complete work items table** exactly as returned — do not summarise or collapse it. Then ask the user if they want to proceed and view the release note preview.
