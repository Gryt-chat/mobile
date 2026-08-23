Pod::Spec.new do |s|
  s.name           = 'AudioRoute'
  s.version        = '1.0.0'
  s.summary        = 'Reads and sets the iOS audio output route.'
  s.description    = 'Reads and sets the iOS audio output route.'
  s.author         = 'Gryt'
  s.homepage       = 'https://gryt.chat'
  s.license        = { :type => 'AGPL-3.0' }
  s.platforms      = { :ios => '15.1' }
  s.swift_version  = '5.9'
  s.source         = { git: 'https://github.com/Gryt-chat/mobile.git' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  # `RTCAudioSession`, so route changes go through the wrapper WebRTC actually
  # reads rather than the bare `AVAudioSession` underneath it. Same pod and same
  # version react-native-webrtc depends on — a second copy of the framework
  # would be two `sharedInstance`s and no lock between them.
  s.dependency 'JitsiWebRTC', '~> 124.0.0'

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
