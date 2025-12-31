#!/bin/bash
# Test the new menu formatting

echo "Testing menu option selection..."
echo ""
echo "Simulating: Select option 1 (Configuration), then 4 (Advanced), then 1 (Toggle Dry Run), then q twice"
echo ""

# Send commands: 1 (Config menu), 4 (Advanced), 1 (Toggle Dry Run), Enter, q, q
printf "1\n4\n1\n\nq\nq\n" | node src/cli/menu-main.js

