__kuito.patch('counter', function (api) {
  var count = api.state('count', 0);

  api.render(
    __kuitoJSX('Button', {
      id: 'counter',
      text: function () {
        return String(count.value);
      },
      onPress: function () {
        count.value += 1;
      },
    }),
  );
});
