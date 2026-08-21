Pod::Spec.new do |s|
  s.name           = 'LanDiscovery'
  s.version        = '1.0.0'
  s.summary        = 'Browses the LAN for Gryt servers advertising _gryt._tcp.'
  s.description    = 'Browses the LAN for Gryt servers advertising _gryt._tcp.'
  s.author         = 'Gryt'
  s.homepage       = 'https://gryt.chat'
  s.license        = { :type => 'AGPL-3.0' }
  s.platforms      = { :ios => '15.1' }
  s.swift_version  = '5.9'
  s.source         = { git: 'https://github.com/Gryt-chat/mobile.git' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
