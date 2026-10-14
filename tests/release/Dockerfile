FROM docker.io/homebrew/brew:latest

ENV HOMEBREW_NO_AUTO_UPDATE=1 \
    HOMEBREW_NO_ANALYTICS=1 \
    HOMEBREW_NO_ENV_HINTS=1 \
    HOMEBREW_NO_INSTALL_CLEANUP=1

COPY --chmod=755 entrypoint.sh /usr/local/bin/btk-release-test

ENTRYPOINT ["btk-release-test"]
