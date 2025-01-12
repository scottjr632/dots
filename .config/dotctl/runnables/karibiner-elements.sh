#!/bin/sh

wget -P /tmp/ https://github.com/pqrs-org/Karabiner-Elements/releases/download/v15.3.0/karabiner-elements-15.3.0.dmg

hdiutil attach /tmp/Karabiner-Elements-15.3.0.dmg

open /Volumes/Karabiner-Elements-15.3.0/Karabiner-Elements.pkg

# hdiutil detach /tmp/Karabiner-Elements-15.3.0.dmg
