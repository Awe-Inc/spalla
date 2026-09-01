#include "fretless/platform/FileDialog.h"

#if defined(_WIN32)

#include <windows.h>
#include <commdlg.h>

#include <vector>

namespace fretless::platform {
namespace {

[[nodiscard]] std::string toUtf8(const std::wstring& wide) {
    if (wide.empty()) {
        return {};
    }
    const int size = WideCharToMultiByte(CP_UTF8, 0, wide.c_str(),
                                         static_cast<int>(wide.size()),
                                         nullptr, 0, nullptr, nullptr);
    std::string result(static_cast<std::size_t>(size), '\0');
    WideCharToMultiByte(CP_UTF8, 0, wide.c_str(), static_cast<int>(wide.size()),
                        result.data(), size, nullptr, nullptr);
    return result;
}

[[nodiscard]] std::wstring toWide(const std::string& utf8) {
    if (utf8.empty()) {
        return {};
    }
    const int size = MultiByteToWideChar(CP_UTF8, 0, utf8.c_str(),
                                         static_cast<int>(utf8.size()), nullptr, 0);
    std::wstring result(static_cast<std::size_t>(size), L'\0');
    MultiByteToWideChar(CP_UTF8, 0, utf8.c_str(), static_cast<int>(utf8.size()),
                        result.data(), size);
    return result;
}

}  // namespace

std::string openScoreDialog(const std::string& initialDirectory) {
    wchar_t path[MAX_PATH] = {};
    const std::wstring initial = toWide(initialDirectory);

    OPENFILENAMEW ofn{};
    ofn.lStructSize = sizeof(ofn);
    ofn.hwndOwner   = GetActiveWindow();
    ofn.lpstrFilter = L"MusicXML\0*.musicxml;*.xml;*.mxl\0All files\0*.*\0";
    ofn.lpstrFile   = path;
    ofn.nMaxFile    = MAX_PATH;
    ofn.lpstrTitle  = L"Open a score";
    ofn.lpstrInitialDir = initial.empty() ? nullptr : initial.c_str();
    // NOCHANGEDIR matters: without it the dialog silently moves the process
    // working directory and every later relative asset path breaks.
    ofn.Flags = OFN_FILEMUSTEXIST | OFN_PATHMUSTEXIST | OFN_NOCHANGEDIR | OFN_EXPLORER;

    if (GetOpenFileNameW(&ofn) == TRUE) {
        return toUtf8(path);
    }
    return {};
}

}  // namespace fretless::platform

#else

namespace fretless::platform {

std::string openScoreDialog(const std::string&) {
    return {};   // drag and drop covers the other platforms for now
}

}  // namespace fretless::platform

#endif
